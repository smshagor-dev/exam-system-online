import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = changePasswordSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid request' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      password: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const matches = await bcrypt.compare(parsed.data.currentPassword, user.password)
  if (!matches) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
  }

  const isSamePassword = await bcrypt.compare(parsed.data.newPassword, user.password)
  if (isSamePassword) {
    return NextResponse.json({ error: 'New password must be different from the current password' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      password: await bcrypt.hash(parsed.data.newPassword, 12),
    },
  })

  return NextResponse.json({ success: true })
}
