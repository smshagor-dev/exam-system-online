'use client'
/**
 * src/lib/socket.ts
 * Client-side Socket.IO connection management.
 * Uses session JWT for authentication.
 */

import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@/types/socket'

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>
export type { AppSocket }

let socket: AppSocket | null = null

export function getSocket(token: string): AppSocket {
  if (socket?.connected) return socket

  if (socket) {
    socket.disconnect()
  }

  socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  }) as AppSocket

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id)
  })

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason)
  })

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message)
  })

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
