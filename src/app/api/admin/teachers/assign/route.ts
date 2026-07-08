import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canManageDepartment } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.DEPARTMENT_ADMIN)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { teacherId, departmentId, subjectId, languageId, groupId, academicYearId, semesterId } = await req.json()
  if (!teacherId || !departmentId || !subjectId || !languageId || !groupId || !academicYearId || !semesterId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    const allowed = await canManageDepartment(
      { userId: session.user.id, role: session.user.role },
      departmentId
    )
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
    }

    const [teacher, subject] = await Promise.all([
      prisma.teacherProfile.findUnique({
        where: { id: teacherId },
        select: { id: true, departmentId: true },
      }),
      prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true, departmentId: true },
      }),
    ])

    if (!teacher || teacher.departmentId !== departmentId) {
      return NextResponse.json({ error: 'Teacher does not belong to this department' }, { status: 400 })
    }

    if (!subject || subject.departmentId !== departmentId) {
      return NextResponse.json({ error: 'Subject does not belong to this department' }, { status: 400 })
    }

    const assignment = await prisma.teacherAssignment.create({
      data: { teacherId, departmentId, subjectId, languageId, groupId, academicYearId, semesterId },
      include: { subject: true, language: true, group: true, academicYear: true, semester: true },
    })
    return NextResponse.json(assignment, { status: 201 })
  } catch (err: any) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'Assignment already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
  }
}
