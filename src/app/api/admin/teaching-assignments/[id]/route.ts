import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import {
  getAllowedAssignmentActions,
  transitionTeachingAssignment,
  type TeachingAssignmentAction,
} from '@/lib/teaching-assignment-admin'
import { prisma } from '@/lib/prisma'

const actionSchema = z.object({
  action: z.enum(['submit', 'approve', 'reject', 'activate', 'suspend', 'complete', 'cancel']),
  notes: z.string().trim().max(1000).optional().nullable(),
})

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const scope = await getAdminScope()
  const { id } = await params
  const parsed = actionSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const assignment = await prisma.teachingAssignment.findUnique({
    where: { id },
    select: { id: true, departmentId: true },
  })

  if (!assignment) {
    return NextResponse.json({ error: 'Teaching assignment not found' }, { status: 404 })
  }

  if (!canAccessDepartment(scope, assignment.departmentId)) {
    return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
  }

  try {
    const updated = await transitionTeachingAssignment({
      assignmentId: id,
      action: parsed.data.action as TeachingAssignmentAction,
      actorUserId: scope.session.user.id,
      notes: parsed.data.notes ?? null,
    })

    return NextResponse.json({
      assignment: {
        ...updated,
        allowedActions: getAllowedAssignmentActions(updated.status),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to transition teaching assignment' },
      { status: 400 }
    )
  }
}
