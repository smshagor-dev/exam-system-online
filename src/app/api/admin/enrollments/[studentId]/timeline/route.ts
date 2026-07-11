import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/api-errors'
import { getAdminScope } from '@/lib/admin-scope'
import { getStudentTimeline } from '@/lib/student-lifecycle'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  try {
    const scope = await getAdminScope()
    const { studentId } = await params

    const student = await prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { departmentId: true },
    })
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }
    if (!scope.isSuperAdmin && !scope.managedDepartmentIds.includes(student.departmentId)) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const timeline = await getStudentTimeline(studentId)
    return NextResponse.json(timeline)
  } catch (error: unknown) {
    const message = getErrorMessage(error, 'Failed to load student timeline')
    const status = message === 'UNAUTHORIZED' ? 401 : message === 'FORBIDDEN' ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
