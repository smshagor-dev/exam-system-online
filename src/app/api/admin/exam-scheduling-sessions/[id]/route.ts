import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'
import { examSchedulingSessionSchema } from '@/lib/phase8-validators'
import { issueAdmitCards, notifySchedulingPublished } from '@/lib/phase8-scheduling'
import { Phase8ScheduleLifecycleStatus } from '@prisma/client'

const ALLOWED_SESSION_TRANSITIONS: Record<Phase8ScheduleLifecycleStatus, Phase8ScheduleLifecycleStatus[]> = {
  DRAFT: [Phase8ScheduleLifecycleStatus.DRAFT, Phase8ScheduleLifecycleStatus.SCHEDULED],
  SCHEDULED: [Phase8ScheduleLifecycleStatus.SCHEDULED, Phase8ScheduleLifecycleStatus.PUBLISHED],
  PUBLISHED: [Phase8ScheduleLifecycleStatus.PUBLISHED, Phase8ScheduleLifecycleStatus.LOCKED],
  LOCKED: [Phase8ScheduleLifecycleStatus.LOCKED, Phase8ScheduleLifecycleStatus.RUNNING],
  RUNNING: [Phase8ScheduleLifecycleStatus.RUNNING, Phase8ScheduleLifecycleStatus.COMPLETED],
  COMPLETED: [Phase8ScheduleLifecycleStatus.COMPLETED, Phase8ScheduleLifecycleStatus.ARCHIVED],
  ARCHIVED: [Phase8ScheduleLifecycleStatus.ARCHIVED],
}

function resolveRequestedStatus(body: Record<string, unknown>) {
  if (body.action === 'publish') return Phase8ScheduleLifecycleStatus.PUBLISHED
  if (body.action === 'lock') return Phase8ScheduleLifecycleStatus.LOCKED
  if (body.action === 'start') return Phase8ScheduleLifecycleStatus.RUNNING
  if (body.action === 'complete') return Phase8ScheduleLifecycleStatus.COMPLETED
  if (body.action === 'archive') return Phase8ScheduleLifecycleStatus.ARCHIVED
  if (typeof body.status === 'string' && body.status in Phase8ScheduleLifecycleStatus) {
    return body.status as Phase8ScheduleLifecycleStatus
  }
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await prisma.examSchedulingSession.findUnique({
    where: { id },
    select: {
      id: true,
      departmentId: true,
      campusId: true,
      status: true,
    },
  })
  if (!existing) return NextResponse.json({ error: 'Scheduling session not found' }, { status: 404 })
  const access = await requirePhase8Permission('exam.schedule.manage', { departmentId: existing.departmentId, campusId: existing.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const nextStatus = resolveRequestedStatus(body)
  if (nextStatus) {
    const allowedNextStatuses = ALLOWED_SESSION_TRANSITIONS[existing.status]
    if (!allowedNextStatuses.includes(nextStatus)) {
      return NextResponse.json(
        {
          error: `Invalid lifecycle transition from ${existing.status} to ${nextStatus}`,
        },
        { status: 409 }
      )
    }

    const now = new Date()
    const session = await prisma.$transaction(async (tx) => {
      const updated = await tx.examSchedulingSession.update({
        where: { id },
        data: {
          status: nextStatus,
          publishedAt:
            nextStatus === Phase8ScheduleLifecycleStatus.PUBLISHED
              ? now
              : body.publishedAt === null
                ? null
                : undefined,
          lockedAt:
            nextStatus === Phase8ScheduleLifecycleStatus.LOCKED
              ? now
              : body.lockedAt === null
                ? null
                : undefined,
        },
      })

      if (nextStatus !== Phase8ScheduleLifecycleStatus.DRAFT) {
        await tx.examScheduleItem.updateMany({
          where: {
            schedulingSessionId: id,
            status: { not: Phase8ScheduleLifecycleStatus.ARCHIVED },
          },
          data: {
            status: nextStatus,
          },
        })
      }

      await tx.activityLog.create({
        data: {
          userId: access.session.user.id,
          action: 'phase8.scheduling_session.transition',
          details: JSON.stringify({
            schedulingSessionId: id,
            from: existing.status,
            to: nextStatus,
          }),
        },
      })

      return updated
    })

    if (nextStatus === Phase8ScheduleLifecycleStatus.PUBLISHED) {
      await issueAdmitCards(id)
      await notifySchedulingPublished(id)
    }

    return NextResponse.json(session)
  }

  if (
    existing.status === Phase8ScheduleLifecycleStatus.LOCKED ||
    existing.status === Phase8ScheduleLifecycleStatus.RUNNING ||
    existing.status === Phase8ScheduleLifecycleStatus.COMPLETED ||
    existing.status === Phase8ScheduleLifecycleStatus.ARCHIVED
  ) {
    return NextResponse.json(
      {
        error: `Scheduling session in ${existing.status} state is immutable except for allowed lifecycle transitions`,
      },
      { status: 409 }
    )
  }

  const parsed = examSchedulingSessionSchema.partial().safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const updated = await prisma.examSchedulingSession.update({
    where: { id },
    data: {
      ...parsed.data,
      publishedAt: parsed.data.publishedAt ? new Date(parsed.data.publishedAt) : parsed.data.publishedAt,
      lockedAt: parsed.data.lockedAt ? new Date(parsed.data.lockedAt) : parsed.data.lockedAt,
    },
  })
  await prisma.activityLog.create({
    data: {
      userId: access.session.user.id,
      action: 'phase8.scheduling_session.updated',
      details: JSON.stringify({
        schedulingSessionId: id,
        fields: Object.keys(parsed.data),
      }),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const existing = await prisma.examSchedulingSession.findUnique({
    where: { id },
    select: {
      departmentId: true,
      campusId: true,
    },
  })
  if (!existing) return NextResponse.json({ error: 'Scheduling session not found' }, { status: 404 })
  const access = await requirePhase8Permission('exam.schedule.manage', { departmentId: existing.departmentId, campusId: existing.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await prisma.examSchedulingSession.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
