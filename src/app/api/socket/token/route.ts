/**
 * /api/socket/token
 * Issues a short-lived JWT for Socket.IO authentication.
 * The socket server validates this same token.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAuthSecret } from '@/lib/auth-secret'
import * as jose from 'jose'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const secret = new TextEncoder().encode(getAuthSecret())

  const token = await new jose.SignJWT({
    id: session.user.id,
    role: session.user.role,
    name: session.user.name,
    email: session.user.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('12h')
    .sign(secret)

  return NextResponse.json({ token })
}
