import path from 'path'
import { monitorEventLoopDelay } from 'perf_hooks'
import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { createClient } from 'redis'
import * as jose from 'jose'
import {
  connectSocket,
  databaseDir,
  ensureEvidenceDirs,
  networkDir,
  sampleProcessStats,
  startRedis,
  startServer,
  stopRedis,
  stopServer,
  waitForSocketEvent,
  writeJson,
} from './evidence-helpers.mjs'
import {
  closePhase6FixturesPrisma,
  ensurePhase6EvidenceFixtures,
} from './evidence-fixtures.mjs'

const prisma = new PrismaClient()

const LOAD_THRESHOLD = {
  connectionSuccessRateMin: 95,
  joinSuccessRateMin: 95,
  saveSuccessRateMin: 95,
  submitSuccessRateMin: 95,
  maxDuplicateRecords: 0,
}

const HARNESS_DEADLINE_MS = 15 * 60 * 1000

const STAGE_TIMEOUTS_MS = {
  connect: 5000,
  join: 20000,
  start: 45000,
  save: 10000,
  heartbeat: 5000,
  submit: 10000,
}

const BATCH_CONFIG = {
  connect: { size: 50, delayMs: 40 },
  join: { size: 25, delayMs: 75 },
  start: { size: 5, delayMs: 125 },
  save: { size: 20, delayMs: 40 },
  heartbeat: { size: 20, delayMs: 25 },
  submit: { size: 20, delayMs: 40 },
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientPrismaError(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return (
    message.includes('timed out') ||
    message.includes('unexpected end of file') ||
    message.includes('retryablewriteerror') ||
    message.includes('transienttransactionerror') ||
    message.includes('server selection timeout') ||
    message.includes('i/o error')
  )
}

async function withRetry(label, fn, options = {}) {
  const retries = options.retries ?? 3
  const delayMs = options.delayMs ?? 1000
  let lastError = null

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt >= retries || !isTransientPrismaError(error)) {
        throw error
      }
      console.warn(`[phase6-load] ${label} failed on attempt ${attempt}/${retries}, retrying...`)
      await sleep(delayMs * attempt)
    }
  }

  throw lastError
}

async function assertDatabaseHealthy() {
  try {
    await prisma.exam.count()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Database preflight failed: ${message}`)
  }
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

function summarizeLatency(values) {
  return {
    count: values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
  }
}

function getErrorCountByStage(clients) {
  const counts = {}
  for (const client of clients) {
    for (const error of client.errors) {
      counts[error.stage] = (counts[error.stage] ?? 0) + 1
    }
  }
  return counts
}

function getErrorCountByCode(clients, stageFilter = null) {
  const counts = {}
  for (const client of clients) {
    for (const error of client.errors) {
      if (stageFilter && error.stage !== stageFilter) {
        continue
      }
      const code = error.code ?? 'UNCLASSIFIED'
      counts[code] = (counts[code] ?? 0) + 1
    }
  }
  return counts
}

function createClientState(user, label, index) {
  return {
    ...user,
    label: `${label}-${index + 1}`,
    socket: null,
    connected: false,
    joined: false,
    started: false,
    saved: false,
    heartbeated: false,
    submitted: false,
    attemptId: null,
    reconnectToken: null,
    errors: [],
    latencies: {
      connect: null,
      join: null,
      start: null,
      save: null,
      heartbeat: null,
      submit: null,
    },
  }
}

async function ensureLoadStudents(fixtures, count, prefix) {
  const existingOffering = fixtures.scopes.english
  const passwordHash = bcrypt.hashSync(fixtures.passwords.student, 12)
  const users = []
  const indexes = Array.from({ length: count }, (_, index) => index + 1)
  const descriptors = indexes.map((index) => ({
    index,
    email: `p6.${prefix}.${String(index).padStart(3, '0')}@student.examflow.pro`,
    name: `P6 ${prefix} Student ${index}`,
  }))

  const existingUsers = await prisma.user.findMany({
    where: {
      email: {
        in: descriptors.map((entry) => entry.email),
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  })
  const existingUsersByEmail = new Map(existingUsers.map((entry) => [entry.email, entry]))
  const missingUsers = descriptors.filter((entry) => !existingUsersByEmail.has(entry.email))

  for (let offset = 0; offset < missingUsers.length; offset += 10) {
    const batch = missingUsers.slice(offset, offset + 10)
    await Promise.all(
      batch.map(async (entry) => {
        const user = await prisma.user.upsert({
          where: { email: entry.email },
          update: {
            role: UserRole.STUDENT,
            isActive: true,
            isEmailVerified: true,
            password: passwordHash,
            name: entry.name,
          },
          create: {
            email: entry.email,
            role: UserRole.STUDENT,
            isActive: true,
            isEmailVerified: true,
            password: passwordHash,
            name: entry.name,
          },
        })
        existingUsersByEmail.set(entry.email, {
          id: user.id,
          email: user.email,
          name: user.name,
        })
      })
    )
  }

  const hydratedUsers = await prisma.user.findMany({
    where: {
      email: {
        in: descriptors.map((entry) => entry.email),
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  })

  const existingProfiles = await prisma.studentProfile.findMany({
    where: {
      userId: {
        in: hydratedUsers.map((entry) => entry.id),
      },
    },
    select: {
      id: true,
      userId: true,
    },
  })
  const existingProfilesByUserId = new Map(existingProfiles.map((entry) => [entry.userId, entry]))
  const missingProfiles = hydratedUsers.filter((entry) => !existingProfilesByUserId.has(entry.id))

  for (let offset = 0; offset < missingProfiles.length; offset += 10) {
    const batch = missingProfiles.slice(offset, offset + 10)
    await Promise.all(
      batch.map(async (entry) => {
        const profile = await prisma.studentProfile.upsert({
          where: { userId: entry.id },
          update: { departmentId: fixtures.ids.department.cse },
          create: { userId: entry.id, departmentId: fixtures.ids.department.cse },
        })
        existingProfilesByUserId.set(entry.id, {
          id: profile.id,
          userId: profile.userId,
        })
      })
    )
  }

  const profiles = await prisma.studentProfile.findMany({
    where: {
      userId: {
        in: hydratedUsers.map((entry) => entry.id),
      },
    },
    select: {
      id: true,
      userId: true,
    },
  })
  const profileByUserId = new Map(profiles.map((entry) => [entry.userId, entry]))

  const existingSubjects = await prisma.studentSubject.findMany({
    where: {
      studentId: {
        in: profiles.map((entry) => entry.id),
      },
      subjectId: existingOffering.subjectId,
      languageId: existingOffering.languageId,
      groupId: existingOffering.groupId,
      academicYearId: existingOffering.academicYearId,
      semesterId: existingOffering.semesterId,
    },
    select: {
      studentId: true,
    },
  })
  const existingSubjectStudentIds = new Set(existingSubjects.map((entry) => entry.studentId))
  const missingSubjects = profiles.filter((entry) => !existingSubjectStudentIds.has(entry.id))

  for (let offset = 0; offset < missingSubjects.length; offset += 10) {
    const batch = missingSubjects.slice(offset, offset + 10)
    await Promise.all(
      batch.map(async (entry) => {
        await prisma.studentSubject.upsert({
          where: {
            studentId_subjectId_languageId_groupId_academicYearId_semesterId: {
              studentId: entry.id,
              subjectId: existingOffering.subjectId,
              languageId: existingOffering.languageId,
              groupId: existingOffering.groupId,
              academicYearId: existingOffering.academicYearId,
              semesterId: existingOffering.semesterId,
            },
          },
          update: { academicOfferingId: existingOffering.academicOfferingId },
          create: {
            studentId: entry.id,
            subjectId: existingOffering.subjectId,
            languageId: existingOffering.languageId,
            groupId: existingOffering.groupId,
            academicYearId: existingOffering.academicYearId,
            semesterId: existingOffering.semesterId,
            academicOfferingId: existingOffering.academicOfferingId,
          },
        })
      })
    )
  }

  for (const user of hydratedUsers) {
    const profile = profileByUserId.get(user.id)
    if (!profile) {
      continue
    }
    users.push({
      email: user.email,
      userId: user.id,
      studentId: profile.id,
      name: user.name,
    })
  }

  return users
}

async function cleanupAttemptsForUsers(examId, users) {
  const studentIds = users.map((user) => user.studentId)
  for (let pass = 0; pass < 5; pass += 1) {
    const attempts = await prisma.studentExamAttempt.findMany({
      where: { examId, studentId: { in: studentIds } },
      select: { id: true },
    })
    const attemptIds = attempts.map((attempt) => attempt.id)

    if (attemptIds.length === 0) {
      return
    }

    await prisma.examResult.deleteMany({ where: { attemptId: { in: attemptIds } } })
    await prisma.studentAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } })
    await prisma.examAttemptSnapshot.deleteMany({ where: { attemptId: { in: attemptIds } } })
    await prisma.activityLog.deleteMany({
      where: {
        examId,
        OR: [
          { action: { in: ['RECONNECT', 'DISCONNECT', 'MANUAL_SUBMIT', 'AUTO_SUBMIT'] } },
          { details: { contains: '"attemptId":' } },
        ],
      },
    }).catch(() => {})

    try {
      await prisma.studentExamAttempt.deleteMany({ where: { id: { in: attemptIds } } })
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const relationBlocked = message.includes('ExamResultToStudentExamAttempt')
      if (!relationBlocked || pass === 4) {
        throw error
      }
      await sleep(250 * (pass + 1))
    }
  }
}

async function resetScenarioAttempts(examId, users, label) {
  await withRetry(`cleanupAttemptsForUsers(${label})`, () =>
    cleanupAttemptsForUsers(examId, users)
  )
}

async function waitForActivityLogCount({ examId, action, userIds, minimumCount, timeoutMs = 5000 }) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const count = await prisma.activityLog.count({
      where: {
        examId,
        action,
        userId: { in: userIds },
      },
    })
    if (count >= minimumCount) {
      return count
    }
    await sleep(100)
  }

  return prisma.activityLog.count({
    where: {
      examId,
      action,
      userId: { in: userIds },
    },
  })
}

async function startLoadServer(options) {
  return withRetry(
    'startServer(load)',
    async () => {
      const server = await startServer(options)
      return server
    },
    { retries: 2, delayMs: 2000 }
  )
}

async function ensureExamStarted(teacherSocket, examId) {
  return withRetry(
    `ensureExamStarted(${examId})`,
    async () => {
      const startedPromise = waitForSocketEvent(teacherSocket, 'exam:started', 20000)
      teacherSocket.emit('teacher:start_exam', { examId })
      await startedPromise
    },
    { retries: 2, delayMs: 1000 }
  )
}

async function createSignedSocketToken(user, role = 'STUDENT') {
  const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!authSecret) {
    throw new Error('Missing AUTH_SECRET or NEXTAUTH_SECRET for load token generation')
  }

  const secret = new TextEncoder().encode(authSecret)
  return new jose.SignJWT({
    id: user.userId,
    role,
    name: user.name,
    email: user.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('12h')
    .sign(secret)
}

async function runBatches(items, config, fn, deadlineAt = null) {
  for (let index = 0; index < items.length; index += config.size) {
    if (deadlineAt && Date.now() > deadlineAt) {
      throw new Error(`Load harness exceeded ${HARNESS_DEADLINE_MS}ms deadline`)
    }
    const batch = items.slice(index, index + config.size)
    await Promise.all(batch.map((item) => fn(item, index)))
    if (index + config.size < items.length) {
      await sleep(config.delayMs)
    }
  }
}

function recordStageFailure(client, stage, error) {
  const message = error instanceof Error ? error.message : String(error)
  const codeMatch = /^([A-Z_]+):(.*)$/.exec(message)
  client.errors.push({
    stage,
    code: codeMatch?.[1],
    message: codeMatch?.[2]?.trim() || message,
  })
}

function waitForJoinOutcome(socket, timeoutMs) {
  return waitForServerOutcome({
    socket,
    eventName: 'exam:joined',
    timeoutMs,
    timeoutCode: 'JOIN_TIMEOUT',
    timeoutMessage: 'Timed out waiting for exam:joined',
  })
}

function waitForServerOutcome({ socket, eventName, timeoutMs, timeoutCode, timeoutMessage }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`${timeoutCode}:${timeoutMessage}`))
    }, timeoutMs)

    function cleanup() {
      clearTimeout(timer)
      socket.off(eventName, onSuccess)
      socket.off('error', onError)
    }

    function onSuccess(payload) {
      cleanup()
      resolve(payload)
    }

    function onError(payload) {
      cleanup()
      reject(new Error(`${payload?.code ?? 'UNCLASSIFIED'}:${payload?.message ?? 'Socket error'}`))
    }

    socket.on(eventName, onSuccess)
    socket.on('error', onError)
  })
}

async function connectClient(baseUrl, client) {
  const startedAt = Date.now()
  const token = await createSignedSocketToken(client)
  const socket = connectSocket(baseUrl, token)
  client.socket = socket
  try {
    await waitForSocketEvent(socket, 'connect', STAGE_TIMEOUTS_MS.connect)
    client.connected = true
    client.latencies.connect = Date.now() - startedAt
  } catch (error) {
    recordStageFailure(client, 'connect', error)
    socket.disconnect()
    client.socket = null
  }
}

async function joinClient(examId, client) {
  if (!client.socket || !client.connected) return

  const startedAt = Date.now()
  try {
    const joinedPromise = waitForJoinOutcome(client.socket, STAGE_TIMEOUTS_MS.join)
    const statePromise = waitForSocketEvent(
      client.socket,
      'exam:attempt_state',
      STAGE_TIMEOUTS_MS.join
    ).catch(() => null)

    client.socket.emit('student:join_exam', { examId })
    const joined = await joinedPromise
    client.joined = true
    client.latencies.join = Date.now() - startedAt

    if (joined.attemptId) {
      client.attemptId = joined.attemptId
      const state = await statePromise
      client.reconnectToken = state?.reconnectToken ?? null
      client.started = true
    }
  } catch (error) {
    recordStageFailure(client, 'join', error)
  }
}

async function startAttemptClient(examId, client) {
  if (!client.socket || !client.joined || client.started) return

  const startedAt = Date.now()
  try {
    const startedPromise = waitForServerOutcome({
      socket: client.socket,
      eventName: 'exam:attempt_started',
      timeoutMs: STAGE_TIMEOUTS_MS.start,
      timeoutCode: 'START_TIMEOUT',
      timeoutMessage: 'Timed out waiting for exam:attempt_started',
    })
    client.socket.emit('student:start_attempt', { examId })
    const started = await startedPromise
    client.attemptId = started.attemptId
    client.reconnectToken = started.reconnectToken ?? null
    client.started = true
    client.latencies.start = Date.now() - startedAt
  } catch (error) {
    recordStageFailure(client, 'start', error)
  }
}

async function saveClientAnswer(client, questionId, optionId, requestId) {
  if (!client.socket || !client.started || !client.attemptId) return

  const startedAt = Date.now()
  try {
    const savedPromise = waitForServerOutcome({
      socket: client.socket,
      eventName: 'exam:answer_saved',
      timeoutMs: STAGE_TIMEOUTS_MS.save,
      timeoutCode: 'SAVE_TIMEOUT',
      timeoutMessage: 'Timed out waiting for exam:answer_saved',
    })
    client.socket.emit('student:save_answer', {
      attemptId: client.attemptId,
      questionId,
      selectedOption: optionId,
      requestId,
      clientSavedAtMs: Date.now(),
    })
    const saved = await savedPromise
    if (!saved?.saved) {
      throw new Error('Save acknowledgement was not successful')
    }
    client.saved = true
    client.latencies.save = Date.now() - startedAt
  } catch (error) {
    recordStageFailure(client, 'save', error)
  }
}

async function heartbeatClient(examId, client) {
  if (!client.socket || !client.started || !client.attemptId) return

  const startedAt = Date.now()
  try {
    const ackPromise = waitForServerOutcome({
      socket: client.socket,
      eventName: 'exam:heartbeat_ack',
      timeoutMs: STAGE_TIMEOUTS_MS.heartbeat,
      timeoutCode: 'HEARTBEAT_TIMEOUT',
      timeoutMessage: 'Timed out waiting for exam:heartbeat_ack',
    })
    client.socket.emit('student:heartbeat', {
      examId,
      attemptId: client.attemptId,
      pendingQueueSize: 0,
      reconnectToken: client.reconnectToken ?? undefined,
    })
    await ackPromise
    client.heartbeated = true
    client.latencies.heartbeat = Date.now() - startedAt
  } catch (error) {
    recordStageFailure(client, 'heartbeat', error)
  }
}

async function submitClient(client) {
  if (!client.socket || !client.started || !client.attemptId) return

  const startedAt = Date.now()
  try {
    const submittedPromise = waitForServerOutcome({
      socket: client.socket,
      eventName: 'exam:submitted',
      timeoutMs: STAGE_TIMEOUTS_MS.submit,
      timeoutCode: 'SUBMIT_TIMEOUT',
      timeoutMessage: 'Timed out waiting for exam:submitted',
    })
    client.socket.emit('student:submit_exam', { attemptId: client.attemptId })
    const submitted = await submittedPromise
    if (!submitted?.success) {
      throw new Error('Submit acknowledgement was not successful')
    }
    client.submitted = true
    client.latencies.submit = Date.now() - startedAt
  } catch (error) {
    recordStageFailure(client, 'submit', error)
  }
}

function summarizeScenario(label, clients, eventLoopLag) {
  const connectLatencies = clients.map((client) => client.latencies.connect).filter(Boolean)
  const joinLatencies = clients.map((client) => client.latencies.join).filter(Boolean)
  const startLatencies = clients.map((client) => client.latencies.start).filter(Boolean)
  const saveLatencies = clients.map((client) => client.latencies.save).filter(Boolean)
  const heartbeatLatencies = clients.map((client) => client.latencies.heartbeat).filter(Boolean)
  const submitLatencies = clients.map((client) => client.latencies.submit).filter(Boolean)

  return {
    label,
    attemptedClients: clients.length,
    connectedClients: clients.filter((client) => client.connected).length,
    successfulJoins: clients.filter((client) => client.joined).length,
    successfulStarts: clients.filter((client) => client.started).length,
    successfulSaves: clients.filter((client) => client.saved).length,
    successfulHeartbeats: clients.filter((client) => client.heartbeated).length,
    successfulSubmits: clients.filter((client) => client.submitted).length,
    connectionSuccessRate: (clients.filter((client) => client.connected).length / clients.length) * 100,
    joinSuccessRate: (clients.filter((client) => client.joined).length / clients.length) * 100,
    saveSuccessRate: (clients.filter((client) => client.saved).length / clients.length) * 100,
    submitSuccessRate:
      clients.filter((client) => client.submitted).length === 0
        ? 0
        : (clients.filter((client) => client.submitted).length / clients.length) * 100,
    errorCountByStage: getErrorCountByStage(clients),
    errorCountByCode: getErrorCountByCode(clients),
    joinFailureByCode: getErrorCountByCode(clients, 'join'),
    submitFailureByCode: getErrorCountByCode(clients, 'submit'),
    errorRate: (clients.filter((client) => client.errors.length > 0).length / clients.length) * 100,
    latencyMs: {
      connect: summarizeLatency(connectLatencies),
      join: summarizeLatency(joinLatencies),
      start: summarizeLatency(startLatencies),
      save: summarizeLatency(saveLatencies),
      heartbeat: summarizeLatency(heartbeatLatencies),
      submit: summarizeLatency(submitLatencies),
    },
    eventLoopLagMs: {
      p50: Number((eventLoopLag.percentile(50) / 1_000_000).toFixed(2)),
      p95: Number((eventLoopLag.percentile(95) / 1_000_000).toFixed(2)),
      p99: Number((eventLoopLag.percentile(99) / 1_000_000).toFixed(2)),
      max: Number((eventLoopLag.max / 1_000_000).toFixed(2)),
    },
    incompleteMetrics:
      clients.some((client) => !client.connected) ||
      clients.some((client) => !client.joined) ||
      clients.some((client) => !client.saved),
    sampleErrors: clients
      .filter((client) => client.errors.length > 0)
      .slice(0, 10)
      .map((client) => ({
        label: client.label,
        stage: client.errors[0].stage,
        message: client.errors[0].message,
      })),
  }
}

async function flushLoadArtifacts(output) {
  await writeJson(path.join(networkDir, 'load-tests.json'), output)
  await writeJson(path.join(databaseDir, 'load-tests-db.json'), {
    duplicateRecords: output.metrics.duplicateRecords ?? null,
    scenarios: output.scenarios,
  })
}

async function disconnectClients(clients) {
  for (const client of clients) {
    client.socket?.disconnect()
    client.socket = null
  }
}

async function runMainLoadScenario({ baseUrl, examId, users, label, questionId, optionId }) {
  const clients = users.map((user, index) => createClientState(user, label, index))
  const eventLoopLag = monitorEventLoopDelay({ resolution: 20 })
  eventLoopLag.enable()
  const deadlineAt = Date.now() + HARNESS_DEADLINE_MS

  try {
    await runBatches(clients, BATCH_CONFIG.connect, (client) => connectClient(baseUrl, client), deadlineAt)
    await runBatches(clients, BATCH_CONFIG.join, (client) => joinClient(examId, client), deadlineAt)
    await runBatches(clients, BATCH_CONFIG.start, (client) => startAttemptClient(examId, client), deadlineAt)
    await runBatches(
      clients,
      BATCH_CONFIG.save,
      (client, index) =>
        saveClientAnswer(client, questionId, optionId, `${label}-save-${index}-${Date.now()}`),
      deadlineAt
    )
    await runBatches(clients, BATCH_CONFIG.heartbeat, (client) => heartbeatClient(examId, client), deadlineAt)
    await runBatches(clients, BATCH_CONFIG.submit, (client) => submitClient(client), deadlineAt)
  } finally {
    eventLoopLag.disable()
    await disconnectClients(clients)
  }

  return summarizeScenario(label, clients, eventLoopLag)
}

async function runReconnectStorm({ baseUrl, examId, users }) {
  const clients = users.map((user, index) => createClientState(user, `reconnect-${index + 1}`, index))
  const reconnectCycles = 3
  const deadlineAt = Date.now() + HARNESS_DEADLINE_MS

  await runBatches(clients, BATCH_CONFIG.connect, (client) => connectClient(baseUrl, client), deadlineAt)
  await runBatches(clients, BATCH_CONFIG.join, (client) => joinClient(examId, client), deadlineAt)
  await runBatches(clients, BATCH_CONFIG.start, (client) => startAttemptClient(examId, client), deadlineAt)

  let successfulReconnects = 0
  for (let cycle = 1; cycle <= reconnectCycles; cycle += 1) {
    for (const client of clients) {
      client.socket?.disconnect()
      client.socket = null
      client.connected = false
      client.joined = false
    }

    await runBatches(clients, BATCH_CONFIG.connect, (client) => connectClient(baseUrl, client), deadlineAt)
    await runBatches(clients, BATCH_CONFIG.join, (client) => joinClient(examId, client), deadlineAt)
    successfulReconnects += clients.filter((client) => client.joined && client.connected).length
  }

  await disconnectClients(clients)

  return {
    attemptedClients: clients.length,
    reconnectCycles,
    successfulReconnects,
    errorCountByStage: getErrorCountByStage(clients),
    errorCountByCode: getErrorCountByCode(clients),
    sampleErrors: clients
      .filter((client) => client.errors.length > 0)
      .slice(0, 10)
      .map((client) => ({
        label: client.label,
        stage: client.errors[0].stage,
        message: client.errors[0].message,
      })),
  }
}

async function runDuplicateSaveStorm({ baseUrl, examId, users, questionId, optionId }) {
  const clients = users.map((user, index) => createClientState(user, `dup-save-${index + 1}`, index))
  const deadlineAt = Date.now() + HARNESS_DEADLINE_MS

  await runBatches(clients, BATCH_CONFIG.connect, (client) => connectClient(baseUrl, client), deadlineAt)
  await runBatches(clients, BATCH_CONFIG.join, (client) => joinClient(examId, client), deadlineAt)
  await runBatches(clients, BATCH_CONFIG.start, (client) => startAttemptClient(examId, client), deadlineAt)

  await runBatches(clients, BATCH_CONFIG.save, async (client, index) => {
    if (!client.socket || !client.attemptId) return
    const requestId = `dup-save-storm-${index}`
    await saveClientAnswer(client, questionId, optionId, requestId)
    if (!client.socket) return
    const ackPromise = waitForServerOutcome({
      socket: client.socket,
      eventName: 'exam:answer_saved',
      timeoutMs: STAGE_TIMEOUTS_MS.save,
      timeoutCode: 'SAVE_TIMEOUT',
      timeoutMessage: 'Timed out waiting for exam:answer_saved',
    })
    client.socket.emit('student:save_answer', {
      attemptId: client.attemptId,
      questionId,
      selectedOption: optionId,
      requestId,
      clientSavedAtMs: Date.now(),
    })
    await ackPromise.catch((error) => recordStageFailure(client, 'duplicate-save', error))
  }, deadlineAt)

  await disconnectClients(clients)

  const duplicateGroups = await prisma.studentAnswer.groupBy({
    by: ['attemptId', 'questionId'],
    where: {
      attempt: {
        examId,
        studentId: { in: users.map((user) => user.studentId) },
      },
    },
    _count: true,
  })

  return {
    attemptedClients: clients.length,
    duplicateAnswerGroups: duplicateGroups.filter((entry) => entry._count > 1).length,
    errorCountByStage: getErrorCountByStage(clients),
    errorCountByCode: getErrorCountByCode(clients),
  }
}

async function runDuplicateSubmitStorm({ baseUrl, examId, users, questionId, optionId }) {
  const clients = users.map((user, index) => createClientState(user, `dup-submit-${index + 1}`, index))
  const deadlineAt = Date.now() + HARNESS_DEADLINE_MS
  const userIds = users.map((user) => user.userId)

  await runBatches(clients, BATCH_CONFIG.connect, (client) => connectClient(baseUrl, client), deadlineAt)
  await runBatches(clients, BATCH_CONFIG.join, (client) => joinClient(examId, client), deadlineAt)
  await runBatches(clients, BATCH_CONFIG.start, (client) => startAttemptClient(examId, client), deadlineAt)
  await runBatches(
    clients,
    BATCH_CONFIG.save,
    (client, index) => saveClientAnswer(client, questionId, optionId, `dup-submit-save-${index}`),
    deadlineAt
  )
  await runBatches(clients, BATCH_CONFIG.submit, (client) => submitClient(client), deadlineAt)

  const beforeDuplicateLogs = await waitForActivityLogCount({
    examId,
    action: 'MANUAL_SUBMIT',
    userIds,
    minimumCount: users.length,
  })

  await runBatches(clients, BATCH_CONFIG.submit, async (client) => {
    if (!client.socket || !client.attemptId) return
    const submittedPromise = waitForServerOutcome({
      socket: client.socket,
      eventName: 'exam:submitted',
      timeoutMs: STAGE_TIMEOUTS_MS.submit,
      timeoutCode: 'SUBMIT_TIMEOUT',
      timeoutMessage: 'Timed out waiting for exam:submitted',
    })
    client.socket.emit('student:submit_exam', { attemptId: client.attemptId })
    await submittedPromise.catch((error) => recordStageFailure(client, 'duplicate-submit', error))
  }, deadlineAt)

  await sleep(500)
  const afterDuplicateLogs = await prisma.activityLog.count({
    where: {
      examId,
      action: 'MANUAL_SUBMIT',
      userId: { in: userIds },
    },
  })

  await disconnectClients(clients)

  return {
    attemptedClients: clients.length,
    beforeDuplicateLogs,
    afterDuplicateLogs,
    noDuplicateSubmitSideEffects: beforeDuplicateLogs === afterDuplicateLogs,
    errorCountByStage: getErrorCountByStage(clients),
    errorCountByCode: getErrorCountByCode(clients),
  }
}

async function runHeartbeatLoad({ baseUrl, examId, users }) {
  const clients = users.map((user, index) => createClientState(user, `heartbeat-${index + 1}`, index))
  const deadlineAt = Date.now() + HARNESS_DEADLINE_MS
  await runBatches(clients, BATCH_CONFIG.connect, (client) => connectClient(baseUrl, client), deadlineAt)
  await runBatches(clients, BATCH_CONFIG.join, (client) => joinClient(examId, client), deadlineAt)
  await runBatches(clients, BATCH_CONFIG.start, (client) => startAttemptClient(examId, client), deadlineAt)
  await runBatches(clients, BATCH_CONFIG.heartbeat, (client) => heartbeatClient(examId, client), deadlineAt)
  await disconnectClients(clients)

  return {
    attemptedClients: clients.length,
    successfulHeartbeats: clients.filter((client) => client.heartbeated).length,
    errorCountByStage: getErrorCountByStage(clients),
    errorCountByCode: getErrorCountByCode(clients),
  }
}

async function runTeacherMonitorFanOut({ baseUrl, examId, questionId, optionId, teacherUser, users }) {
  const teacherSockets = []
  const monitorReceipts = []

  try {
    for (let index = 0; index < 5; index += 1) {
      const token = await createSignedSocketToken(
        {
        userId: teacherUser.userId,
        email: teacherUser.email,
        name: teacherUser.name,
        },
        'TEACHER'
      )
      const socket = connectSocket(baseUrl, token)
      teacherSockets.push(socket)
      await waitForSocketEvent(socket, 'connect', 5000)
      const monitorPromise = waitForSocketEvent(
        socket,
        'exam:monitor_snapshot',
        10000,
        (payload) => payload.examId === examId
      )
      socket.emit('teacher:join_exam_monitor', { examId })
      monitorReceipts.push(await monitorPromise)
    }

    const student = createClientState(users[0], 'fanout-student', 0)
    await connectClient(baseUrl, student)
    await joinClient(examId, student)
    await startAttemptClient(examId, student)
    await saveClientAnswer(student, questionId, optionId, 'fanout-save')
    await submitClient(student)
    await disconnectClients([student])
  } finally {
    for (const socket of teacherSockets) {
      socket.disconnect()
    }
  }

  return {
    attemptedMonitorSockets: teacherSockets.length,
    initialMonitorReceipts: monitorReceipts.length,
  }
}

async function collectRedisStats(redisUrl) {
  const redisClient = createClient({ url: redisUrl })
  await redisClient.connect()
  const memory = await redisClient.info('memory')
  const stats = await redisClient.info('stats')
  await redisClient.quit()

  return { memory, stats }
}

async function main() {
  await ensureEvidenceDirs()

  const output = {
    executedAt: new Date().toISOString(),
    status: 'BLOCKED',
    thresholds: LOAD_THRESHOLD,
    stageTimeoutsMs: STAGE_TIMEOUTS_MS,
    batchConfig: BATCH_CONFIG,
    scenarios: {},
    metrics: {},
    bottleneck: null,
    notes: [],
  }

  let redis = null
  let server = null
  let teacherSocket = null

  try {
    await assertDatabaseHealthy()
    output.metrics.databaseHealthBeforeStart = 'ok'

    const fixtures = await withRetry('ensurePhase6EvidenceFixtures', () =>
      ensurePhase6EvidenceFixtures()
    )
    redis = await startRedis('load')

    const redisHealthClient = createClient({ url: redis.redisUrl })
    await redisHealthClient.connect()
    output.metrics.redisHealthBeforeStart = await redisHealthClient.ping()
    await redisHealthClient.quit()

    server = await startLoadServer({
      port: 3220,
      redisUrl: redis.redisUrl,
      logPrefix: 'phase6-load-server',
      nodeEnv: 'production',
      extraEnv: {
        PHASE6_JOIN_TIMING: 'true',
      },
    })

    const teacherToken = await createSignedSocketToken(
      {
        userId: fixtures.ids.teacher.johnUserId,
        email: fixtures.emails.leadTeacher,
        name: 'John Smith',
      },
      'TEACHER'
    )
    teacherSocket = connectSocket(server.baseUrl, teacherToken)
    await waitForSocketEvent(teacherSocket, 'connect', 5000)
    const initialMonitorPromise = waitForSocketEvent(
      teacherSocket,
      'exam:monitor_snapshot',
      10000,
      (payload) => payload.examId === fixtures.ids.phase6.loadExam
    )
    teacherSocket.emit('teacher:join_exam_monitor', { examId: fixtures.ids.phase6.loadExam })
    const initialMonitor = await initialMonitorPromise
    if (initialMonitor.runtime.mode !== 'redis') {
      throw new Error(`Load server monitor did not report redis mode (got ${initialMonitor.runtime.mode})`)
    }

    await ensureExamStarted(teacherSocket, fixtures.ids.phase6.loadExam)

    const exam = await prisma.exam.findUniqueOrThrow({
      where: { id: fixtures.ids.phase6.loadExam },
      include: {
        questions: {
          include: {
            question: { include: { options: { orderBy: { orderIndex: 'asc' } } } },
          },
        },
      },
    })
    const question = exam.questions[0].question
    const option = question.options[0]

    const users100 = await withRetry('ensureLoadStudents(100)', () =>
      ensureLoadStudents(fixtures, 100, 'load100')
    )
    const users10 = users100.slice(0, 10)
    const users25 = users100.slice(0, 25)
    const users250 = await withRetry('ensureLoadStudents(250)', () =>
      ensureLoadStudents(fixtures, 250, 'load250')
    )
    const users500 = await withRetry('ensureLoadStudents(500)', () =>
      ensureLoadStudents(fixtures, 500, 'load500')
    )
    const reconnectUsers = await withRetry('ensureLoadStudents(reconnect)', () =>
      ensureLoadStudents(fixtures, 25, 'storm-reconnect')
    )
    const duplicateSaveUsers = await withRetry('ensureLoadStudents(save-storm)', () =>
      ensureLoadStudents(fixtures, 40, 'storm-save')
    )
    const duplicateSubmitUsers = await withRetry('ensureLoadStudents(submit-storm)', () =>
      ensureLoadStudents(fixtures, 40, 'storm-submit')
    )
    const heartbeatUsers = await withRetry('ensureLoadStudents(heartbeat)', () =>
      ensureLoadStudents(fixtures, 60, 'storm-heartbeat')
    )
    const fanoutUsers = await withRetry('ensureLoadStudents(fanout)', () =>
      ensureLoadStudents(fixtures, 10, 'storm-fanout')
    )

    await withRetry('cleanupAttemptsForUsers(initial)', () =>
      cleanupAttemptsForUsers(fixtures.ids.phase6.loadExam, [
        ...users100,
        ...users250,
        ...users500,
        ...reconnectUsers,
        ...duplicateSaveUsers,
        ...duplicateSubmitUsers,
        ...heartbeatUsers,
        ...fanoutUsers,
      ])
    )

    output.metrics.serverStats = {
      before100: await sampleProcessStats(server.child.pid),
    }

    await resetScenarioAttempts(fixtures.ids.phase6.loadExam, users10, 'run10')
    output.scenarios.run10 = await runMainLoadScenario({
      baseUrl: server.baseUrl,
      examId: fixtures.ids.phase6.loadExam,
      users: users10,
      label: 'run10',
      questionId: question.id,
      optionId: option.id,
    })
    await flushLoadArtifacts(output)

    await resetScenarioAttempts(fixtures.ids.phase6.loadExam, users25, 'run25')
    output.scenarios.run25 = await runMainLoadScenario({
      baseUrl: server.baseUrl,
      examId: fixtures.ids.phase6.loadExam,
      users: users25,
      label: 'run25',
      questionId: question.id,
      optionId: option.id,
    })
    await flushLoadArtifacts(output)

    await resetScenarioAttempts(fixtures.ids.phase6.loadExam, users100, 'run100')
    output.scenarios.run100 = await runMainLoadScenario({
      baseUrl: server.baseUrl,
      examId: fixtures.ids.phase6.loadExam,
      users: users100,
      label: 'run100',
      questionId: question.id,
      optionId: option.id,
    })
    await flushLoadArtifacts(output)

    output.metrics.serverStats.after100 = await sampleProcessStats(server.child.pid)

    await resetScenarioAttempts(fixtures.ids.phase6.loadExam, users250, 'run250')
    output.scenarios.run250 = await runMainLoadScenario({
      baseUrl: server.baseUrl,
      examId: fixtures.ids.phase6.loadExam,
      users: users250,
      label: 'run250',
      questionId: question.id,
      optionId: option.id,
    })
    await flushLoadArtifacts(output)

    await resetScenarioAttempts(fixtures.ids.phase6.loadExam, users500, 'run500')
    output.scenarios.run500 = await runMainLoadScenario({
      baseUrl: server.baseUrl,
      examId: fixtures.ids.phase6.loadExam,
      users: users500,
      label: 'run500',
      questionId: question.id,
      optionId: option.id,
    })
    await flushLoadArtifacts(output)

    output.metrics.serverStats.after500 = await sampleProcessStats(server.child.pid)

    await resetScenarioAttempts(fixtures.ids.phase6.loadExam, reconnectUsers, 'reconnectStorm')
    output.scenarios.reconnectStorm = await runReconnectStorm({
      baseUrl: server.baseUrl,
      examId: fixtures.ids.phase6.loadExam,
      users: reconnectUsers,
    })
    await flushLoadArtifacts(output)

    await resetScenarioAttempts(fixtures.ids.phase6.loadExam, duplicateSaveUsers, 'duplicateSaveStorm')
    output.scenarios.duplicateSaveStorm = await runDuplicateSaveStorm({
      baseUrl: server.baseUrl,
      examId: fixtures.ids.phase6.loadExam,
      users: duplicateSaveUsers,
      questionId: question.id,
      optionId: option.id,
    })
    await flushLoadArtifacts(output)

    await resetScenarioAttempts(fixtures.ids.phase6.loadExam, duplicateSubmitUsers, 'duplicateSubmitStorm')
    output.scenarios.duplicateSubmitStorm = await runDuplicateSubmitStorm({
      baseUrl: server.baseUrl,
      examId: fixtures.ids.phase6.loadExam,
      users: duplicateSubmitUsers,
      questionId: question.id,
      optionId: option.id,
    })
    await flushLoadArtifacts(output)

    await resetScenarioAttempts(fixtures.ids.phase6.loadExam, heartbeatUsers, 'heartbeatLoad')
    output.scenarios.heartbeatLoad = await runHeartbeatLoad({
      baseUrl: server.baseUrl,
      examId: fixtures.ids.phase6.loadExam,
      users: heartbeatUsers,
    })
    await flushLoadArtifacts(output)

    await resetScenarioAttempts(fixtures.ids.phase6.loadExam, fanoutUsers, 'teacherMonitorFanOut')
    output.scenarios.teacherMonitorFanOut = await runTeacherMonitorFanOut({
      baseUrl: server.baseUrl,
      examId: fixtures.ids.phase6.loadExam,
      questionId: question.id,
      optionId: option.id,
      teacherUser: {
        userId: fixtures.ids.teacher.johnUserId,
        email: fixtures.emails.leadTeacher,
        name: 'John Smith',
      },
      users: fanoutUsers,
    })
    await flushLoadArtifacts(output)

    output.metrics.redisUsage = await collectRedisStats(redis.redisUrl)
    output.metrics.finalServerStats = await sampleProcessStats(server.child.pid)

    const duplicateAnswers = await prisma.studentAnswer.groupBy({
      by: ['attemptId', 'questionId'],
      where: { attempt: { examId: fixtures.ids.phase6.loadExam } },
      _count: true,
    })

    const duplicateAttempts = await prisma.studentExamAttempt.groupBy({
      by: ['examId', 'studentId'],
      where: {
        examId: fixtures.ids.phase6.loadExam,
        status: { in: ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED'] },
      },
      _count: true,
    })

    output.metrics.duplicateRecords = {
      answerGroups: duplicateAnswers.filter((entry) => entry._count > 1).length,
      attemptGroups: duplicateAttempts.filter((entry) => entry._count > 1).length,
    }

    const pass100 =
      output.scenarios.run100.connectionSuccessRate >= LOAD_THRESHOLD.connectionSuccessRateMin &&
      output.scenarios.run100.joinSuccessRate >= LOAD_THRESHOLD.joinSuccessRateMin &&
      output.scenarios.run100.saveSuccessRate >= LOAD_THRESHOLD.saveSuccessRateMin &&
      output.scenarios.run100.submitSuccessRate >= LOAD_THRESHOLD.submitSuccessRateMin

    const pass500 =
      output.scenarios.run500.connectionSuccessRate >= LOAD_THRESHOLD.connectionSuccessRateMin &&
      output.scenarios.run500.joinSuccessRate >= LOAD_THRESHOLD.joinSuccessRateMin &&
      output.scenarios.run500.saveSuccessRate >= LOAD_THRESHOLD.saveSuccessRateMin &&
      output.scenarios.run500.submitSuccessRate >= LOAD_THRESHOLD.submitSuccessRateMin

    const pass250 =
      output.scenarios.run250.connectionSuccessRate >= LOAD_THRESHOLD.connectionSuccessRateMin &&
      output.scenarios.run250.joinSuccessRate >= LOAD_THRESHOLD.joinSuccessRateMin &&
      output.scenarios.run250.saveSuccessRate >= LOAD_THRESHOLD.saveSuccessRateMin &&
      output.scenarios.run250.submitSuccessRate >= LOAD_THRESHOLD.submitSuccessRateMin

    const zeroDuplicates =
      output.metrics.duplicateRecords.answerGroups <= LOAD_THRESHOLD.maxDuplicateRecords &&
      output.metrics.duplicateRecords.attemptGroups <= LOAD_THRESHOLD.maxDuplicateRecords

    output.status = pass100 && pass250 && pass500 && zeroDuplicates ? 'PASS' : 'BLOCKED'

    if (!pass250) {
      output.bottleneck = '250-user scenario did not meet minimum success thresholds.'
    }
    if (!pass500) {
      output.bottleneck = output.bottleneck ?? '500-user scenario did not meet minimum success thresholds.'
    }
    if (!zeroDuplicates) {
      output.bottleneck =
        output.bottleneck ?? 'Duplicate DB records were detected after load execution.'
    }
  } catch (error) {
    output.status = 'BLOCKED'
    const joinFanInBlocked =
      output.scenarios.run100?.connectedClients > 0 &&
      output.scenarios.run100?.successfulJoins === 0 &&
      output.scenarios.run500?.connectedClients > 0 &&
      output.scenarios.run500?.successfulJoins === 0

    output.bottleneck = joinFanInBlocked
      ? 'Bulk student:join_exam fan-in timed out under load.'
      : error instanceof Error
        ? error.message
        : String(error)
    output.notes.push('Load harness terminated early before all metrics could be collected.')
  } finally {
    await flushLoadArtifacts(output)

    teacherSocket?.disconnect()
    await stopServer(server).catch(() => {})
    await stopRedis(redis).catch(() => {})
    await prisma.$disconnect().catch(() => {})
    await closePhase6FixturesPrisma().catch(() => {})
  }

  if (output.status !== 'PASS') {
    throw new Error(output.bottleneck || 'Load tests did not meet Phase 6 acceptance thresholds')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
