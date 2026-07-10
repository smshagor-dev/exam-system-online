import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyAccountSchema } from '@/lib/validators'
import { isEmailVerificationRequired } from '@/lib/system-settings'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = verifyAccountSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const requireVerification = await isEmailVerificationRequired()

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      isEmailVerified: true,
      emailVerificationCode: true,
      emailVerificationExpiresAt: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'Invalid verification request.' }, { status: 400 })
  }

  if (!requireVerification) {
    if (!user.isEmailVerified) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isEmailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpiresAt: null,
        },
      })
    }

    return NextResponse.json({ message: 'Email verification is disabled. Your account is ready to sign in.' })
  }

  if (user.isEmailVerified) {
    return NextResponse.json({ message: 'Your account is already verified.' })
  }

  if (
    !user.emailVerificationCode ||
    !user.emailVerificationExpiresAt ||
    user.emailVerificationCode !== parsed.data.code ||
    user.emailVerificationExpiresAt.getTime() < Date.now()
  ) {
    return NextResponse.json({ error: 'Invalid or expired verification code.' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isEmailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiresAt: null,
    },
  })

  return NextResponse.json({ message: 'Your account has been verified successfully.' })
}
