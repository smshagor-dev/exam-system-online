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

  const body = await req.json()
  const { teacherId } = body
  const assignments = Array.isArray(body.assignments)
    ? body.assignments
    : [body]

  if (!teacherId || assignments.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    const teacher = await prisma.teacherProfile.findUnique({
      where: { id: teacherId },
      select: { id: true, departmentId: true },
    })

    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found' }, { status: 404 })
    }

    const createdAssignments = await prisma.$transaction(async (tx) => {
      const results = []

      for (const assignmentInput of assignments) {
        const { departmentId, subjectId, languageId, groupId, academicYearId, semesterId } = assignmentInput ?? {}

        if (!departmentId || !subjectId || !languageId || !groupId || !academicYearId || !semesterId) {
          throw new Error('Missing required assignment fields')
        }

        const allowed = await canManageDepartment(
          { userId: session.user.id, role: session.user.role },
          departmentId
        )
        if (!allowed) {
          throw new Error('Forbidden for this department')
        }

        const [department, subject, language, group, year, semester] = await Promise.all([
          tx.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true } }),
          tx.subject.findFirst({ where: { id: subjectId, departmentId, isActive: true }, select: { id: true, departmentId: true } }),
          tx.language.findFirst({ where: { id: languageId, isActive: true }, select: { id: true } }),
          tx.group.findFirst({ where: { id: groupId, academicYearId, isActive: true }, select: { id: true } }),
          tx.academicYear.findFirst({ where: { id: academicYearId, isActive: true }, select: { id: true } }),
          tx.semester.findFirst({ where: { id: semesterId, isActive: true }, select: { id: true } }),
        ])

        if (!department) throw new Error('Invalid department')
        if (!subject) throw new Error('Subject does not belong to this department')
        if (!language) throw new Error('Invalid department language')
        if (!group) throw new Error('Group does not belong to this academic year')
        if (!year) throw new Error('Invalid academic year')
        if (!semester) throw new Error('Invalid semester')

        const created = await tx.teacherAssignment.create({
          data: { teacherId, departmentId, subjectId, languageId, groupId, academicYearId, semesterId },
          include: { subject: true, language: true, group: true, academicYear: true, semester: true, department: true },
        })

        results.push(created)
      }

      return results
    })

    return NextResponse.json(
      { count: createdAssignments.length, assignments: createdAssignments, homeDepartmentId: teacher.departmentId },
      { status: 201 }
    )
  } catch (err: any) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: 'One or more assignments already exist' }, { status: 409 })
    }

    if (typeof err.message === 'string' && err.message.length > 0) {
      const status =
        err.message === 'Forbidden for this department' ? 403 :
        err.message.startsWith('Missing required') ? 400 :
        err.message.startsWith('Invalid') || err.message.includes('Subject does not belong') ? 400 :
        500

      return NextResponse.json({ error: err.message }, { status })
    }

    return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 })
  }
}
