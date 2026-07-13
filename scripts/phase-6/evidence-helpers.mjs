import fs from 'fs/promises'
import path from 'path'
import net from 'net'
import { createWriteStream } from 'fs'
import { spawn, spawnSync } from 'child_process'
import { request } from 'playwright'
import { RedisMemoryServer } from 'redis-memory-server'
import { createClient } from 'redis'
import { io as socketIo } from 'socket.io-client'

export const rootDir = process.cwd()
export const phaseDir = path.join(rootDir, 'docs', 'phase-6')
export const evidenceDir = path.join(phaseDir, 'evidence')
export const browserDir = path.join(evidenceDir, 'browser')
export const networkDir = path.join(evidenceDir, 'network')
export const consoleDir = path.join(evidenceDir, 'console')
export const databaseDir = path.join(evidenceDir, 'database')

export function rel(filePath) {
  return filePath.replace(`${rootDir}${path.sep}`, '').replaceAll('\\', '/')
}

export async function ensureEvidenceDirs() {
  await Promise.all([
    fs.mkdir(browserDir, { recursive: true }),
    fs.mkdir(networkDir, { recursive: true }),
    fs.mkdir(consoleDir, { recursive: true }),
    fs.mkdir(databaseDir, { recursive: true }),
  ])
}

export async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(value, null, 2))
  return rel(filePath)
}

export async function writeText(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, value, 'utf8')
  return rel(filePath)
}

export async function waitForServer(baseUrl, timeoutMs = 120000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health/ready`)
      if (response.ok) {
        const json = await response.json()
        if (json?.ready) {
          return json
        }
      } else if (response.status === 503) {
        await response.json().catch(() => null)
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`Timed out waiting for ${baseUrl}`)
}

async function waitForServerOrExit(baseUrl, child, timeoutMs = 120000) {
  let exited = false
  let exitCode = null
  child.once('exit', (code) => {
    exited = true
    exitCode = code
  })

  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (exited) {
      throw new Error(`Server process exited before readiness with code ${exitCode ?? 'unknown'}`)
    }
    try {
      const response = await fetch(`${baseUrl}/api/health/ready`)
      if (response.ok) {
        const json = await response.json()
        if (json?.ready) {
          return json
        }
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  if (exited) {
    throw new Error(`Server process exited before readiness with code ${exitCode ?? 'unknown'}`)
  }

  throw new Error(`Timed out waiting for ${baseUrl}`)
}

function checkPortCollision(port, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const tester = net.createServer()
    tester.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        resolve(true)
        return
      }
      reject(error)
    })
    tester.once('listening', () => {
      tester.close(() => resolve(false))
    })
    tester.listen(port, host)
  })
}

export async function cleanupPortCollision(port) {
  const command = [
    `$connections = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue`,
    '$pids = @()',
    'if ($connections) { $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique }',
    'foreach ($processId in $pids) { if ($processId -and $processId -ne $PID) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue } }',
  ].join('; ')

  spawnSync('powershell', ['-NoProfile', '-Command', command], {
    cwd: rootDir,
    stdio: 'ignore',
  })

  await new Promise((resolve) => setTimeout(resolve, 1000))
}

export async function waitForReadiness(baseUrl, timeoutMs = 120000) {
  return waitForServer(baseUrl, timeoutMs)
}

export async function assertPortAvailable(port, host = '127.0.0.1') {
  let inUse = (await checkPortCollision(port, host)) || (await checkPortCollision(port, '::'))
  if (inUse) {
    await cleanupPortCollision(port)
    inUse = (await checkPortCollision(port, host)) || (await checkPortCollision(port, '::'))
  }
  if (inUse) {
    throw new Error(`Port collision detected on ${host}:${port}`)
  }
}

export async function startServer({
  port,
  redisUrl,
  logPrefix,
  nodeEnv = 'development',
  host = '127.0.0.1',
  extraEnv = {},
}) {
  await assertPortAvailable(port, host)
  const baseUrl = `http://${host}:${port}`
  const stdoutPath = path.join(consoleDir, `${logPrefix}.out.log`)
  const stderrPath = path.join(consoleDir, `${logPrefix}.err.log`)
  const stdout = createWriteStream(stdoutPath, { flags: 'w' })
  const stderr = createWriteStream(stderrPath, { flags: 'w' })

  const child = spawn('node', ['server.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: host,
      NODE_ENV: nodeEnv,
      REDIS_URL: redisUrl,
      REDIS_REQUIRED: 'true',
      ALLOW_MEMORY_RUNTIME_FALLBACK: 'false',
      REDIS_CONNECT_TIMEOUT_MS: '30000',
      NEXTAUTH_URL: baseUrl,
      AUTH_URL: baseUrl,
      NEXT_PUBLIC_SOCKET_URL: baseUrl,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.pipe(stdout)
  child.stderr.pipe(stderr)

  await waitForServerOrExit(baseUrl, child)

  return {
    child,
    baseUrl,
    stdoutPath,
    stderrPath,
  }
}

export async function stopServer(serverHandle) {
  if (!serverHandle?.child || serverHandle.child.killed) {
    return
  }

  serverHandle.child.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 8000)
    serverHandle.child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

export async function startRedis(logicalName = 'phase6') {
  const redisServer = new RedisMemoryServer({
    instance: {
      ip: '127.0.0.1',
      args: ['--save', '""'],
    },
  })
  await redisServer.start()
  const host = await redisServer.getHost()
  const port = await redisServer.getPort()
  const redisUrl = `redis://${host}:${port}`
  const startedAt = Date.now()
  let ready = false

  while (Date.now() - startedAt < 30000) {
    const client = createClient({ url: redisUrl })
    try {
      await client.connect()
      await client.ping()
      await client.quit()
      ready = true
      break
    } catch {
      await client.quit().catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  if (!ready) {
    await redisServer.stop().catch(() => {})
    throw new Error(`Redis memory server was not reachable for ${logicalName} at ${redisUrl}`)
  }

  await new Promise((resolve) => setTimeout(resolve, 500))

  return {
    logicalName,
    redisServer,
    redisUrl,
    host,
    port,
  }
}

export async function stopRedis(redisHandle) {
  await redisHandle?.redisServer?.stop()
}

export async function createApiContext(baseUrl, email, password) {
  const api = await request.newContext({ baseURL: baseUrl })
  const csrfResponse = await api.get('/api/auth/csrf')
  const csrfPayload = await csrfResponse.json()
  const response = await api.post('/api/auth/callback/credentials', {
    form: {
      email,
      password,
      csrfToken: csrfPayload.csrfToken,
      callbackUrl: `${baseUrl}/`,
      json: 'true',
    },
  })

  if (response.status() !== 200) {
    throw new Error(`Login failed for ${email}: ${response.status()}`)
  }

  return api
}

export async function getSocketToken(api, evidenceName) {
  const response = await api.fetch('/api/socket/token', { method: 'GET' })
  const json = await response.json()
  const evidence = await writeJson(path.join(networkDir, `${evidenceName}.json`), {
    status: response.status(),
    body: json,
  })

  if (response.status() !== 200 || !json?.token) {
    throw new Error(`Socket token request failed for ${evidenceName}`)
  }

  return { token: json.token, evidence }
}

export function waitForSocketEvent(socket, eventName, timeoutMs = 15000, predicate = null) {
  return new Promise((resolve, reject) => {
    if (eventName === 'connect' && socket.connected) {
      resolve(undefined)
      return
    }

    const timer = setTimeout(() => {
      socket.off(eventName, handler)
      reject(new Error(`Timed out waiting for ${eventName}`))
    }, timeoutMs)

    function handler(payload) {
      if (typeof predicate === 'function' && !predicate(payload)) {
        return
      }
      clearTimeout(timer)
      socket.off(eventName, handler)
      resolve(payload)
    }

    socket.on(eventName, handler)
  })
}

export function connectSocket(baseUrl, token, options = {}) {
  return socketIo(baseUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    forceNew: true,
    reconnection: false,
    ...options,
  })
}

export async function fetchJson(api, method, url, body, evidenceName) {
  const response = await api.fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    data: body,
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}

  const evidence = await writeJson(path.join(networkDir, `${evidenceName}.json`), {
    method,
    url,
    status: response.status(),
    json,
    text,
  })

  return {
    status: response.status(),
    json,
    text,
    evidence,
  }
}

export async function loginPage(page, baseUrl, email, password, landingPath) {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: /sign in|login/i }).click()
  await page.waitForURL((url) => url.pathname.startsWith(landingPath), { timeout: 20000 })
}

export async function primeLocale(context, locale = 'en') {
  await context.addInitScript((value) => {
    window.localStorage.setItem('examflow.siteLocale', value)
  }, locale)
}

export async function sampleProcessStats(pid) {
  const command = [
    '$p = Get-Process -Id ' + pid,
    '$cpu = if ($null -ne $p.CPU) { [Math]::Round($p.CPU, 2) } else { 0 }',
    '$mem = [Math]::Round($p.WorkingSet64 / 1MB, 2)',
    '[Console]::Out.WriteLine((@{ cpuSeconds = $cpu; workingSetMb = $mem; handles = $p.Handles } | ConvertTo-Json -Compress))',
  ].join('; ')

  const result = await new Promise((resolve, reject) => {
    const child = spawn('powershell', ['-NoProfile', '-Command', command], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Failed to sample process stats for ${pid}`))
        return
      }
      try {
        resolve(JSON.parse(stdout.trim()))
      } catch (error) {
        reject(error)
      }
    })
  })

  return result
}
