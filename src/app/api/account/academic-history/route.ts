import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getStudentTimeline } from '@/lib/student-lifecycle'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

function toStudentSafeTimelineItem(item: Awaited<ReturnType<typeof getStudentTimeline>>[number]) {
  return {
    id: item.id,
    eventType: item.eventType,
    reason: item.reason,
    occurredAt: item.occurredAt,
    notes: item.eventType === 'MANUAL_CORRECTION' ? null : item.notes,
    fromProgram: item.fromProgram?.name ?? null,
    toProgram: item.toProgram?.name ?? null,
    fromGroup: item.fromGroup?.name ?? null,
    toGroup: item.toGroup?.name ?? null,
    fromAcademicSession: item.fromAcademicSession?.name ?? null,
    toAcademicSession: item.toAcademicSession?.name ?? null,
    fromStatus: item.fromStatus,
    toStatus: item.toStatus,
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== UserRole.STUDENT) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!profile) {
    return NextResponse.json({ error: 'Student profile not found' }, { status: 404 })
  }

  const timeline = await getStudentTimeline(profile.id)
  return NextResponse.json(timeline.map(toStudentSafeTimelineItem))
}
