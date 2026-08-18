import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { enableReExamManually } from '@/lib/reexam-service'
import { teacherOwnsExam } from '@/lib/permissions'
import { UserRole } from '@prisma/client'

const manualSchema = z.object({
  originalExamId: z.string().trim().min(1),
  studentId: z.string().trim().min(1),
  reason: z.string().trim().max(1500).default('Enabled manually by teacher'),
  type: z.enum(['RETAKE', 'SUPPLEMENTARY', 'IMPROVEMENT', 'BACKLOG']).default('RETAKE'),
})

function errorStatus(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('not found')) return 404
  if (normalized.includes('already') || normalized.includes('cannot be used') || normalized.includes('ended')) return 409
  if (normalized.includes('another teacher') || normalized.includes('not enrolled') || normalized.includes('does not belong')) return 403
  return 400
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can enable a re-exam' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = manualSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const owns = await teacherOwnsExam(
    { userId: session.user.id, role: session.user.role },
    parsed.data.originalExamId
  )
  if (!owns) return NextResponse.json({ error: 'Not allowed for this exam' }, { status: 403 })

  try {
    const request = await enableReExamManually({
      teacherUserId: session.user.id,
      originalExamId: parsed.data.originalExamId,
      studentId: parsed.data.studentId,
      reason: parsed.data.reason,
      type: parsed.data.type,
    })
    return NextResponse.json({ request }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to enable re-exam'
    return NextResponse.json({ error: message }, { status: errorStatus(message) })
  }
}
