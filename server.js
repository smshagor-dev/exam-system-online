/**
 * server.js
 * Custom Node.js server that runs Next.js + Socket.IO together.
 * 
 * Next.js default server does not support WebSockets.
 * This custom server creates an HTTP server, attaches Socket.IO,
 * and passes all other requests to the Next.js request handler.
 * 
 * Usage: node server.js (or npm run dev)
 */

const { createServer } = require('http')
const { parse } = require('url')
const { spawnSync } = require('child_process')
const next = require('next')
const path = require('path')
const { initStudentPromotionCron, stopStudentPromotionCron } = require('./server/student-promotion-cron')

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOST || (dev ? 'localhost' : '0.0.0.0')
const port = parseInt(process.env.PORT || '3000', 10)
const prismaCli = path.join(__dirname, 'node_modules', 'prisma', 'build', 'index.js')

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
}

function isPlaceholderSecret(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return !normalized || normalized.includes('replace-with') || normalized.includes('changeme')
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: __dirname,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  }
}

function runDatabaseSetup() {
  if (!dev && process.env.AUTO_DB_PUSH === 'true') {
    throw new Error('AUTO_DB_PUSH=true is not allowed in production startup.')
  }

  if (process.env.AUTO_DB_PUSH !== 'true') {
    console.log('[DB] Skipping Prisma db push because AUTO_DB_PUSH is not enabled')
    return
  }

  console.log('[DB] Syncing Prisma schema with MongoDB via explicit AUTO_DB_PUSH=true')
  runCommand(process.execPath, [prismaCli, 'db', 'push'])
}

function validateProductionEnvironment() {
  if (dev) {
    return
  }

  if (isPlaceholderSecret(process.env.AUTH_SECRET) && isPlaceholderSecret(process.env.NEXTAUTH_SECRET)) {
    throw new Error('Production startup requires AUTH_SECRET or NEXTAUTH_SECRET to be configured.')
  }

  const nextAuthUrl = String(process.env.NEXTAUTH_URL || '').trim()
  if (!nextAuthUrl || nextAuthUrl.includes('localhost')) {
    throw new Error('Production startup requires NEXTAUTH_URL to be set to a non-localhost URL.')
  }

  if (!String(process.env.DATABASE_URL || '').trim()) {
    throw new Error('Production startup requires DATABASE_URL.')
  }

  if (!isTruthy(process.env.REDIS_REQUIRED)) {
    throw new Error('Production startup requires REDIS_REQUIRED=true.')
  }

  if (isTruthy(process.env.ALLOW_MEMORY_RUNTIME_FALLBACK)) {
    throw new Error('Production startup refuses ALLOW_MEMORY_RUNTIME_FALLBACK=true.')
  }
}

// We need to compile TypeScript socket-server on the fly in dev
// In production, build first with `next build`
async function startServer() {
  validateProductionEnvironment()
  runDatabaseSetup()

  require('ts-node').register({
    project: path.join(__dirname, 'tsconfig.json'),
    transpileOnly: true,
    compilerOptions: {
      module: 'commonjs',
      moduleResolution: 'node',
    },
  })

  const tsConfigPaths = require('tsconfig-paths')
  tsConfigPaths.register({
    baseUrl: __dirname,
    paths: { '@/*': ['src/*'] },
  })

  const { prisma } = require('./src/lib/prisma')
  const socketServerModule = require('./src/server/socket-server')
  const { initSocketServer } = socketServerModule
  let closeSocketServer = socketServerModule.closeSocketServer

  async function writeReadyResponse(res) {
    try {
      await prisma.exam.count()
      const socketHealth = await socketServerModule.getSocketServerHealth()
      const payload = {
        ready:
          socketHealth.socketReady &&
          socketHealth.runtimeAvailable &&
          socketHealth.runtimeMode !== null,
        appReady: true,
        databaseReady: true,
        redisReady: socketHealth.runtimeAvailable,
        socketReady: socketHealth.socketReady,
        runtimeMode: socketHealth.runtimeMode,
        checkedAt: new Date().toISOString(),
      }
      res.statusCode = payload.ready ? 200 : 503
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(payload))
    } catch (error) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          ready: false,
          appReady: true,
          databaseReady: false,
          redisReady: false,
          socketReady: false,
          runtimeMode: null,
          checkedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        })
      )
    }
  }

  const app = next({ dev, hostname, port })
  const handle = app.getRequestHandler()

  await app.prepare()

  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      if (parsedUrl.pathname === '/api/health/ready') {
        await writeReadyResponse(res)
        return
      }
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  })

  await initSocketServer(httpServer)

  httpServer.listen(port, () => {
    console.log(`
╔════════════════════════════════════════╗
║      ExamFlow Pro is running! 🎓      ║
╠════════════════════════════════════════╣
║  URL:    http://${hostname}:${port}         ║
║  Mode:   ${dev ? 'Development              ' : 'Production               '}║
║  Socket: Enabled (ws://${hostname}:${port}) ║
╚════════════════════════════════════════╝
    `)
  })

  initStudentPromotionCron(console)

  let isShuttingDown = false
  const shutdown = async (signal, exitCode = 0) => {
    if (isShuttingDown) return
    isShuttingDown = true

    console.log(`[Server] Received ${signal}. Starting graceful shutdown...`)

    const forceExitTimer = setTimeout(() => {
      console.error('[Server] Graceful shutdown timed out, forcing exit')
      process.exit(1)
    }, 10000)
    forceExitTimer.unref?.()

    try {
      await closeSocketServer()
      await stopStudentPromotionCron()
      await new Promise((resolve, reject) => {
        httpServer.close((error) => {
          if (error) {
            reject(error)
            return
          }

          resolve()
        })
      })
      clearTimeout(forceExitTimer)
      console.log('[Server] Shutdown complete')
      process.exit(exitCode)
    } catch (error) {
      clearTimeout(forceExitTimer)
      console.error('[Server] Graceful shutdown failed:', error)
      process.exit(1)
    }
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
  process.on('uncaughtException', (error) => {
    console.error('[Server] Uncaught exception:', error)
    void shutdown('uncaughtException', 1)
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled rejection:', reason)
    void shutdown('unhandledRejection', 1)
  })
}

startServer().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
