import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSocketServerHealth } from '@/server/socket-server'

export async function GET() {
  const checkedAt = new Date().toISOString()

  try {
    await prisma.exam.count()
    const socket = await getSocketServerHealth()

    const ready =
      socket.socketReady &&
      socket.runtimeAvailable &&
      socket.runtimeMode !== null

    const payload = {
      ready,
      checkedAt,
      appReady: true,
      databaseReady: true,
      redisReady: socket.runtimeAvailable,
      socketReady: socket.socketReady,
      runtimeMode: socket.runtimeMode,
    }

    return NextResponse.json(payload, {
      status: ready ? 200 : 503,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ready: false,
        checkedAt,
        appReady: true,
        databaseReady: false,
        redisReady: false,
        socketReady: false,
        runtimeMode: null,
        error: error instanceof Error ? error.message : String(error),
      },
      {
        status: 503,
      }
    )
  }
}
