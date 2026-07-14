import {
  RELEASE_VERIFY_ADMIN_EMAIL,
  bootstrapReleaseVerificationBundle,
  cleanupReleaseVerificationBundle,
} from './bootstrap-release-verification'

async function main() {
  const adminPassword = process.env.RELEASE_VERIFY_ADMIN_PASSWORD
  if (!adminPassword) {
    throw new Error('Set RELEASE_VERIFY_ADMIN_PASSWORD before running socket verification.')
  }

  const helpers = await import('../phase-6/evidence-helpers.mjs')
  const redis = await helpers.startRedis('production-socket-runtime')
  let server = await helpers.startServer({
    port: 3321,
    redisUrl: redis.redisUrl,
    logPrefix: 'production-socket-runtime',
    nodeEnv: 'production',
    host: '127.0.0.1',
    extraEnv: {
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'release-socket-secret',
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'release-socket-secret',
    },
  })

  try {
    await bootstrapReleaseVerificationBundle()

    const api = await helpers.createApiContext(server.baseUrl, RELEASE_VERIFY_ADMIN_EMAIL, adminPassword)
    const firstToken = await helpers.getSocketToken(api, 'production-socket-token-1')
    const socket1 = helpers.connectSocket(server.baseUrl, firstToken.token)
    await helpers.waitForSocketEvent(socket1, 'connect', 15000)
    socket1.close()

    await helpers.stopServer(server)
    server = await helpers.startServer({
      port: 3321,
      redisUrl: redis.redisUrl,
      logPrefix: 'production-socket-runtime-restart',
      nodeEnv: 'production',
      host: '127.0.0.1',
      extraEnv: {
        AUTH_SECRET: process.env.AUTH_SECRET ?? 'release-socket-secret',
        NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'release-socket-secret',
      },
    })

    const api2 = await helpers.createApiContext(server.baseUrl, RELEASE_VERIFY_ADMIN_EMAIL, adminPassword)
    const secondToken = await helpers.getSocketToken(api2, 'production-socket-token-2')
    const socket2 = helpers.connectSocket(server.baseUrl, secondToken.token)
    await helpers.waitForSocketEvent(socket2, 'connect', 15000)
    socket2.close()

    console.log(
      JSON.stringify(
        {
          status: 'PASS',
          baseUrl: server.baseUrl,
          redisUrl: redis.redisUrl,
          reconnectVerified: true,
        },
        null,
        2
      )
    )
  } finally {
    await cleanupReleaseVerificationBundle().catch(() => {})
    await helpers.stopServer(server).catch(() => {})
    await helpers.stopRedis(redis).catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
