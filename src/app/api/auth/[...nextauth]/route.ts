import type { NextRequest } from 'next/server'
import { handlers } from '@/lib/auth'
import { enforceAuthRateLimit } from '@/lib/auth-rate-limit'

export const GET = handlers.GET

export async function POST(req: NextRequest) {
  if (req.nextUrl.pathname.endsWith('/callback/credentials')) {
    const formData = await req.clone().formData()
    const email = String(formData.get('email') || '').trim().toLowerCase()
    const rateLimitResponse = await enforceAuthRateLimit({
      req,
      action: 'login',
      accountKey: email,
    })
    if (rateLimitResponse) {
      return rateLimitResponse
    }
  }

  return handlers.POST(req)
}
