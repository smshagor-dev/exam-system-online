import { NextRequest, NextResponse } from 'next/server'
import { UserRole } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { sendTestEmail } from '@/lib/auth-code'
import { smtpTestSchema } from '@/lib/validators'

export async function POST(req: NextRequest) {
  await requireRole(UserRole.SUPER_ADMIN)

  const body = await req.json()
  const parsed = smtpTestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  try {
    await sendTestEmail(parsed.data.to)
    return NextResponse.json({ message: `Test email sent to ${parsed.data.to}.` })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send test email.' },
      { status: 400 }
    )
  }
}
