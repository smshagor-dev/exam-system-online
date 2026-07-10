import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forgotPasswordSchema } from '@/lib/validators'
import { sendOneTimeCodeEmail, storePasswordResetCode } from '@/lib/auth-code'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = forgotPasswordSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      email: true,
      name: true,
    },
  })

  if (!user) {
    return NextResponse.json({ message: 'If the account exists, a 6-digit reset code has been sent.' })
  }

  const reset = await storePasswordResetCode(user.id)
  const delivery = await sendOneTimeCodeEmail({
    email: user.email,
    name: user.name,
    code: reset.code,
    purpose: 'reset-password',
  })

  return NextResponse.json({
    message: delivery.sent
      ? 'A 6-digit reset code has been sent to your email.'
      : 'A 6-digit reset code has been generated for your account.',
    debugCode: delivery.debugCode,
  })
}
