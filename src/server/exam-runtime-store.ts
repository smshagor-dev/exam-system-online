import { randomUUID } from 'crypto'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import type { Server as SocketServer } from 'socket.io'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

type ExpireMode = {
  ttlSeconds?: number
}

type StoredExamState = {
  examId: string
  status: 'idle' | 'live' | 'paused' | 'ended'
  startedAtMs: number | null
  pausedAtMs: number | null
  timerOffsetMs: number
  durationMs: number
  updatedAtMs: number
}

type StoredAttemptState = {
  attemptId: string
  examId: string
  userId: string
  studentId: string
  status: string
  socketId: string | null
  joinedAtMs: number
  updatedAtMs: number
  lastHeartbeatAtMs: number | null
  lastSavedAtMs: number | null
  reconnectToken: string
}

type StoredPresenceState = {
  examId: string
  userId: string
  studentId: string
  studentName: string
  socketId: string | null
  online: boolean
  submitted: boolean
  submittedAtMs: number | null
  attemptStatus:
    | 'NOT_STARTED'
    | 'IN_PROGRESS'
    | 'SUBMITTED'
    | 'AUTO_SUBMITTED'
    | 'TIMED_OUT'
    | null
  warnings: number
  tabSwitches: number
  reconnects: number
  lastViolation: string | null
  lastHeartbeatAtMs: number | null
  updatedAtMs: number
}

type StoredAnswerState = {
  attemptId: string
  questionId: string
  selectedOption: string | null
  answerText: string | null
  clientSavedAtMs: number
  serverSavedAtMs: number
  requestId: string
}

type RuntimeStore = {
  mode: 'memory' | 'redis'
  instanceId: string
  configureSocketAdapter: (io: SocketServer) => Promise<void>
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  isAvailable: () => boolean
  getExamState: (examId: string) => Promise<StoredExamState | null>
  setExamState: (examId: string, state: StoredExamState) => Promise<void>
  deleteExamState: (examId: string) => Promise<void>
  getAttemptState: (attemptId: string) => Promise<StoredAttemptState | null>
  setAttemptState: (attemptId: string, state: StoredAttemptState) => Promise<void>
  deleteAttemptState: (attemptId: string) => Promise<void>
  getPresence: (examId: string, userId: string) => Promise<StoredPresenceState | null>
  setPresence: (examId: string, userId: string, state: StoredPresenceState) => Promise<void>
  listPresence: (examId: string) => Promise<StoredPresenceState[]>
  removePresence: (examId: string, userId: string) => Promise<void>
  getAnswerState: (attemptId: string, questionId: string) => Promise<StoredAnswerState | null>
  setAnswerState: (attemptId: string, questionId: string, answer: StoredAnswerState) => Promise<void>
  listAnswerState: (attemptId: string) => Promise<StoredAnswerState[]>
  deleteAnswerState: (attemptId: string, questionId?: string) => Promise<void>
  setJson: (key: string, value: JsonValue, options?: ExpireMode) => Promise<void>
  getJson: <T extends JsonValue>(key: string) => Promise<T | null>
  deleteKey: (key: string) => Promise<void>
  acquireLock: (key: string, ttlMs: number) => Promise<boolean>
  releaseLock: (key: string) => Promise<void>
}

const KEY_PREFIX = 'phase6:exam-runtime'
const DEFAULT_TTL_SECONDS = 60 * 60 * 8
const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 15000

function readBooleanEnv(name: string, defaultValue: boolean) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(raw)
}

function describeRedisTarget(redisUrl: string) {
  try {
    const parsed = new URL(redisUrl)
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || '6379'}${parsed.pathname || ''}`
  } catch {
    return '[invalid redis url]'
  }
}

function getRuntimeConfig() {
  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase() || 'development'
  const redisRequired = readBooleanEnv('REDIS_REQUIRED', nodeEnv === 'production')
  const allowMemoryFallback = readBooleanEnv(
    'ALLOW_MEMORY_RUNTIME_FALLBACK',
    nodeEnv !== 'production'
  )
  const connectTimeoutMs = Number.parseInt(
    process.env.REDIS_CONNECT_TIMEOUT_MS?.trim() || '',
    10
  )

  return {
    nodeEnv,
    redisRequired,
    allowMemoryFallback,
    connectTimeoutMs:
      Number.isFinite(connectTimeoutMs) && connectTimeoutMs > 0
        ? connectTimeoutMs
        : DEFAULT_REDIS_CONNECT_TIMEOUT_MS,
  }
}

function buildKey(...segments: string[]) {
  return [KEY_PREFIX, ...segments].join(':')
}

function stableStringify(value: JsonValue) {
  return JSON.stringify(value)
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function createMemoryStore(): RuntimeStore {
  const examState = new Map<string, StoredExamState>()
  const attemptState = new Map<string, StoredAttemptState>()
  const presenceState = new Map<string, Map<string, StoredPresenceState>>()
  const answerState = new Map<string, Map<string, StoredAnswerState>>()
  const genericState = new Map<string, JsonValue>()
  const locks = new Map<string, number>()
  const instanceId = randomUUID()

  return {
    mode: 'memory',
    instanceId,
    async configureSocketAdapter() {},
    async connect() {},
    async disconnect() {
      examState.clear()
      attemptState.clear()
      presenceState.clear()
      answerState.clear()
      genericState.clear()
      locks.clear()
    },
    isAvailable() {
      return true
    },
    async getExamState(examId) {
      return examState.get(examId) ?? null
    },
    async setExamState(examId, state) {
      examState.set(examId, state)
    },
    async deleteExamState(examId) {
      examState.delete(examId)
    },
    async getAttemptState(attemptId) {
      return attemptState.get(attemptId) ?? null
    },
    async setAttemptState(attemptId, state) {
      attemptState.set(attemptId, state)
    },
    async deleteAttemptState(attemptId) {
      attemptState.delete(attemptId)
      answerState.delete(attemptId)
    },
    async getPresence(examId, userId) {
      return presenceState.get(examId)?.get(userId) ?? null
    },
    async setPresence(examId, userId, state) {
      if (!presenceState.has(examId)) {
        presenceState.set(examId, new Map())
      }
      presenceState.get(examId)!.set(userId, state)
    },
    async listPresence(examId) {
      return [...(presenceState.get(examId)?.values() ?? [])].sort(
        (left, right) => left.studentName.localeCompare(right.studentName)
      )
    },
    async removePresence(examId, userId) {
      presenceState.get(examId)?.delete(userId)
    },
    async getAnswerState(attemptId, questionId) {
      return answerState.get(attemptId)?.get(questionId) ?? null
    },
    async setAnswerState(attemptId, questionId, answer) {
      if (!answerState.has(attemptId)) {
        answerState.set(attemptId, new Map())
      }
      answerState.get(attemptId)!.set(questionId, answer)
    },
    async listAnswerState(attemptId) {
      return [...(answerState.get(attemptId)?.values() ?? [])].sort(
        (left, right) => left.serverSavedAtMs - right.serverSavedAtMs
      )
    },
    async deleteAnswerState(attemptId, questionId) {
      if (!questionId) {
        answerState.delete(attemptId)
        return
      }
      answerState.get(attemptId)?.delete(questionId)
    },
    async setJson(key, value) {
      genericState.set(key, value)
    },
    async getJson<T extends JsonValue>(key: string) {
      return ((genericState.get(key) as JsonValue | undefined) ?? null) as T | null
    },
    async deleteKey(key) {
      genericState.delete(key)
    },
    async acquireLock(key, ttlMs) {
      const now = Date.now()
      const current = locks.get(key)
      if (current && current > now) {
        return false
      }
      locks.set(key, now + ttlMs)
      return true
    },
    async releaseLock(key) {
      locks.delete(key)
    },
  }
}

async function createRedisStore(redisUrl: string): Promise<RuntimeStore> {
  const config = getRuntimeConfig()
  const baseOptions = {
    url: redisUrl,
    socket: {
      connectTimeout: config.connectTimeoutMs,
      reconnectStrategy: false as const,
    },
  }
  const pub = createClient(baseOptions)
  const sub = pub.duplicate()
  const adapterPub = pub.duplicate()
  const adapterSub = pub.duplicate()
  const instanceId = randomUUID()
  let adapterConfigured = false

  const redisLabel = describeRedisTarget(redisUrl)
  const clients = [
    ['runtime-pub', pub],
    ['runtime-sub', sub],
    ['adapter-pub', adapterPub],
    ['adapter-sub', adapterSub],
  ] as const

  for (const [label, client] of clients) {
    client.on('error', (error) => {
      console.error(`[Phase6][Redis][${label}] ${redisLabel}:`, error)
    })
  }

  async function ensureConnected() {
    if (!pub.isOpen) {
      await pub.connect()
    }
    if (!sub.isOpen) {
      await sub.connect()
    }
  }

  async function ensureAdapterConnected() {
    if (!adapterPub.isOpen) {
      await adapterPub.connect()
    }
    if (!adapterSub.isOpen) {
      await adapterSub.connect()
    }
  }

  function withExpiry(options?: ExpireMode) {
    return options?.ttlSeconds ?? DEFAULT_TTL_SECONDS
  }

  const store: RuntimeStore = {
    mode: 'redis',
    instanceId,
    async configureSocketAdapter(io) {
      await ensureConnected()
      await ensureAdapterConnected()
      if (!adapterConfigured) {
        io.adapter(createAdapter(adapterPub, adapterSub))
        adapterConfigured = true
      }
    },
    async connect() {
      console.info(
        `[Phase6][Redis] Connecting runtime store to ${redisLabel} (timeout=${config.connectTimeoutMs}ms)`
      )
      await ensureConnected()
      console.info(`[Phase6][Redis] Runtime store connected to ${redisLabel}`)
    },
    async disconnect() {
      if (pub.isOpen) {
        await pub.quit()
      }
      if (sub.isOpen) {
        await sub.quit()
      }
      if (adapterPub.isOpen) {
        await adapterPub.quit()
      }
      if (adapterSub.isOpen) {
        await adapterSub.quit()
      }
    },
    isAvailable() {
      return pub.isOpen && sub.isOpen && adapterPub.isOpen && adapterSub.isOpen
    },
    async getExamState(examId) {
      return parseJson<StoredExamState>(await pub.get(buildKey('exam', examId)))
    },
    async setExamState(examId, state) {
      await pub.set(buildKey('exam', examId), stableStringify(state), {
        EX: DEFAULT_TTL_SECONDS,
      })
    },
    async deleteExamState(examId) {
      await pub.del(buildKey('exam', examId))
    },
    async getAttemptState(attemptId) {
      return parseJson<StoredAttemptState>(await pub.get(buildKey('attempt', attemptId)))
    },
    async setAttemptState(attemptId, state) {
      await pub.set(buildKey('attempt', attemptId), stableStringify(state), {
        EX: DEFAULT_TTL_SECONDS,
      })
    },
    async deleteAttemptState(attemptId) {
      await pub.del(buildKey('attempt', attemptId))
      await pub.del(buildKey('attempt-answers', attemptId))
    },
    async getPresence(examId, userId) {
      return parseJson<StoredPresenceState>(
        await pub.hGet(buildKey('presence', examId), userId)
      )
    },
    async setPresence(examId, userId, state) {
      const key = buildKey('presence', examId)
      await pub.hSet(key, userId, stableStringify(state))
      await pub.expire(key, DEFAULT_TTL_SECONDS)
    },
    async listPresence(examId) {
      const entries = await pub.hVals(buildKey('presence', examId))
      return entries
        .map((entry) => parseJson<StoredPresenceState>(entry))
        .filter((entry): entry is StoredPresenceState => entry !== null)
        .sort((left, right) => left.studentName.localeCompare(right.studentName))
    },
    async removePresence(examId, userId) {
      await pub.hDel(buildKey('presence', examId), userId)
    },
    async getAnswerState(attemptId, questionId) {
      return parseJson<StoredAnswerState>(
        await pub.hGet(buildKey('attempt-answers', attemptId), questionId)
      )
    },
    async setAnswerState(attemptId, questionId, answer) {
      const key = buildKey('attempt-answers', attemptId)
      await pub.hSet(key, questionId, stableStringify(answer))
      await pub.expire(key, DEFAULT_TTL_SECONDS)
    },
    async listAnswerState(attemptId) {
      const entries = await pub.hVals(buildKey('attempt-answers', attemptId))
      return entries
        .map((entry) => parseJson<StoredAnswerState>(entry))
        .filter((entry): entry is StoredAnswerState => entry !== null)
        .sort((left, right) => left.serverSavedAtMs - right.serverSavedAtMs)
    },
    async deleteAnswerState(attemptId, questionId) {
      if (!questionId) {
        await pub.del(buildKey('attempt-answers', attemptId))
        return
      }
      await pub.hDel(buildKey('attempt-answers', attemptId), questionId)
    },
    async setJson(key, value, options) {
      await pub.set(buildKey('json', key), stableStringify(value), {
        EX: withExpiry(options),
      })
    },
    async getJson<T extends JsonValue>(key: string) {
      return parseJson<T>(await pub.get(buildKey('json', key)))
    },
    async deleteKey(key) {
      await pub.del(buildKey('json', key))
    },
    async acquireLock(key, ttlMs) {
      const lockKey = buildKey('lock', key)
      const result = await pub.eval(
        `
          local current = redis.call('GET', KEYS[1])
          if current == ARGV[1] then
            return redis.call('PEXPIRE', KEYS[1], ARGV[2])
          end

          local acquired = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2])
          if acquired then
            return 1
          end

          return 0
        `,
        {
          keys: [lockKey],
          arguments: [instanceId, String(ttlMs)],
        }
      )

      return Number(result) === 1
    },
    async releaseLock(key) {
      const lockKey = buildKey('lock', key)
      await pub.eval(
        `
          if redis.call('GET', KEYS[1]) == ARGV[1] then
            return redis.call('DEL', KEYS[1])
          end

          return 0
        `,
        {
          keys: [lockKey],
          arguments: [instanceId],
        }
      )
    },
  }

  await store.connect()
  return store
}

let cachedStorePromise: Promise<RuntimeStore> | null = null

export async function getExamRuntimeStore() {
  if (!cachedStorePromise) {
    cachedStorePromise = (async () => {
      const redisUrl = process.env.REDIS_URL?.trim()
      const config = getRuntimeConfig()
      if (!redisUrl) {
        if (config.redisRequired) {
          throw new Error(
            'REDIS_REQUIRED=true but REDIS_URL is not configured. Refusing memory runtime fallback.'
          )
        }

        console.warn('[Phase6][Redis] REDIS_URL is not configured. Using in-memory runtime store.')
        return createMemoryStore()
      }

      try {
        return await createRedisStore(redisUrl)
      } catch (error) {
        if (config.redisRequired || !config.allowMemoryFallback) {
          throw new Error(
            `Redis runtime initialization failed for ${describeRedisTarget(redisUrl)}: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }

        console.warn(
          `[Phase6][Redis] Redis unavailable at ${describeRedisTarget(
            redisUrl
          )}, falling back to in-memory runtime store:`,
          error
        )
        return createMemoryStore()
      }
    })()
  }

  return cachedStorePromise
}

export type {
  JsonValue,
  RuntimeStore,
  StoredAnswerState,
  StoredAttemptState,
  StoredExamState,
  StoredPresenceState,
}
