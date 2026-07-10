import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { resetPasswordSchema } from '@/lib/validators'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = resetPasswordSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      id: true,
      passwordResetCode: true,
      passwordResetExpiresAt: true,
    },
  })

  if (
    !user ||
    !user.passwordResetCode ||
    !user.passwordResetExpiresAt ||
    user.passwordResetCode !== parsed.data.code ||
    user.passwordResetExpiresAt.getTime() < Date.now()
  ) {
    return NextResponse.json({ error: 'Invalid or expired reset code.' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: await bcrypt.hash(parsed.data.password, 12),
      passwordResetCode: null,
      passwordResetExpiresAt: null,
    },
  })

  return NextResponse.json({ message: 'Your password has been reset successfully.' })
}
