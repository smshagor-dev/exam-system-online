import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { approveReExamRequest, rejectReExamRequest } from '@/lib/reexam-service'
import { UserRole } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string }> }

const reviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  teacherResponse: z.string().trim().max(1500).optional().nullable(),
})

function errorStatus(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('not found')) return 404
  if (normalized.includes('another teacher')) return 403
  if (normalized.includes('already') || normalized.includes('only pending') || normalized.includes('cancelled')) return 409
  return 400
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can review re-exam requests' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  try {
    const request = parsed.data.action === 'APPROVE'
      ? await approveReExamRequest({
          teacherUserId: session.user.id,
          requestId: id,
          teacherResponse: parsed.data.teacherResponse,
        })
      : await rejectReExamRequest({
          teacherUserId: session.user.id,
          requestId: id,
          teacherResponse: parsed.data.teacherResponse,
        })

    return NextResponse.json({ request })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to review re-exam request'
    return NextResponse.json({ error: message }, { status: errorStatus(message) })
  }
}
