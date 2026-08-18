import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { requestReExam } from '@/lib/reexam-service'
import { UserRole } from '@prisma/client'

const requestSchema = z.object({
  originalExamId: z.string().trim().min(1),
  reason: z.string().trim().min(10, 'Please provide at least 10 characters for the reason').max(1500),
  type: z.enum(['RETAKE', 'SUPPLEMENTARY', 'IMPROVEMENT', 'BACKLOG']).default('RETAKE'),
})

function errorStatus(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('not found')) return 404
  if (
    normalized.includes('already') ||
    normalized.includes('pending') ||
    normalized.includes('ended') ||
    normalized.includes('cannot be used')
  ) return 409
  if (normalized.includes('not enrolled') || normalized.includes('does not belong')) return 403
  return 400
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.STUDENT) {
    return NextResponse.json({ error: 'Only students can request a re-exam' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  try {
    const request = await requestReExam({
      studentUserId: session.user.id,
      originalExamId: parsed.data.originalExamId,
      reason: parsed.data.reason,
      type: parsed.data.type,
    })
    return NextResponse.json({ request }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to request re-exam'
    return NextResponse.json({ error: message }, { status: errorStatus(message) })
  }
}
