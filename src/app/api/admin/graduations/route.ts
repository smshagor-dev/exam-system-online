import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/api-errors'
import { graduateStudent, markStudentAsAlumni } from '@/lib/student-lifecycle'
import { canAccessDepartment, getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import { studentAlumniSchema, studentGraduationSchema } from '@/lib/validators'

export async function POST(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const body = await req.json()
    const parsed = studentGraduationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const student = await prisma.studentProfile.findUnique({
      where: { id: parsed.data.studentId },
      select: { departmentId: true },
    })
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }
    if (!canAccessDepartment(scope, student.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const result = await graduateStudent(parsed.data.studentId, {
      graduatedAt: new Date(parsed.data.graduatedAt),
      finalCgpa: parsed.data.finalCgpa ?? null,
      degreeClassification: parsed.data.degreeClassification ?? null,
      certificateNumber: parsed.data.certificateNumber ?? null,
      degreeAwarded: parsed.data.degreeAwarded,
      alumniAt: parsed.data.alumniAt ? new Date(parsed.data.alumniAt) : null,
      notes: parsed.data.notes ?? null,
    }, {
      actorUserId: scope.session.user.id,
      actorRole: scope.session.user.role,
      sourceApi: '/api/admin/graduations',
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to graduate student')
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const scope = await getAdminScope()
    const body = await req.json()
    const parsed = studentAlumniSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }
    const student = await prisma.studentProfile.findUnique({
      where: { id: parsed.data.studentId },
      select: { departmentId: true },
    })
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }
    if (!canAccessDepartment(scope, student.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const result = await markStudentAsAlumni(
      parsed.data.studentId,
      parsed.data.alumniAt ? new Date(parsed.data.alumniAt) : new Date(),
      parsed.data.notes ?? null,
      {
        actorUserId: scope.session.user.id,
        actorRole: scope.session.user.role,
        sourceApi: '/api/admin/graduations',
      }
    )

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to mark alumni')
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
