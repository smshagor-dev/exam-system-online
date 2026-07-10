import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendVerificationCodeSchema } from '@/lib/validators'
import { sendOneTimeCodeEmail, storeVerificationCode } from '@/lib/auth-code'
import { isEmailVerificationRequired } from '@/lib/system-settings'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = sendVerificationCodeSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const requireVerification = await isEmailVerificationRequired()
  if (!requireVerification) {
    return NextResponse.json({ message: 'Email verification is currently disabled.' })
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      email: true,
      name: true,
      isEmailVerified: true,
    },
  })

  if (!user) {
    return NextResponse.json({ message: 'If the account exists, a new verification code has been sent.' })
  }

  if (user.isEmailVerified) {
    return NextResponse.json({ message: 'This account is already verified.' })
  }

  const verification = await storeVerificationCode(user.id)
  const delivery = await sendOneTimeCodeEmail({
    email: user.email,
    name: user.name,
    code: verification.code,
    purpose: 'verify-account',
  })

  return NextResponse.json({
    message: delivery.sent
      ? 'A new verification code has been sent.'
      : 'A new verification code has been generated.',
    debugCode: delivery.debugCode,
  })
}
