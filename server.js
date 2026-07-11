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
const hostname = process.env.HOST || 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)
const prismaCli = path.join(__dirname, 'node_modules', 'prisma', 'build', 'index.js')

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
  if (process.env.AUTO_DB_PUSH !== 'true') {
    console.log('[DB] Skipping Prisma db push because AUTO_DB_PUSH is not enabled')
    return
  }

  console.log('[DB] Syncing Prisma schema with MongoDB via explicit AUTO_DB_PUSH=true')
  runCommand(process.execPath, [prismaCli, 'db', 'push'])
}

// We need to compile TypeScript socket-server on the fly in dev
// In production, build first with `next build`
async function startServer() {
  runDatabaseSetup()

  const app = next({ dev, hostname, port })
  const handle = app.getRequestHandler()

  await app.prepare()

  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  })

  // Attach Socket.IO to the HTTP server
  // We use require() with ts-node register in dev, or compiled JS in prod
  let closeSocketServer = async () => {}
  if (dev) {
    // In dev: register ts-node to handle TypeScript imports
    require('ts-node').register({
      project: path.join(__dirname, 'tsconfig.json'),
      transpileOnly: true,
      compilerOptions: {
        module: 'commonjs',
        moduleResolution: 'node',
      },
    })

    // Set up module path alias @/* -> src/*
    const tsConfigPaths = require('tsconfig-paths')
    tsConfigPaths.register({
      baseUrl: __dirname,
      paths: { '@/*': ['src/*'] },
    })

    const socketServerModule = require('./src/server/socket-server')
    const { initSocketServer } = socketServerModule
    closeSocketServer = socketServerModule.closeSocketServer
    initSocketServer(httpServer)
  }

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
