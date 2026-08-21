import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import ClassTestCreateForm, { type ClassTestAssignmentOption } from '@/components/class-tests/ClassTestCreateForm'

export default async function CreateClassTestPage() {
  const session = await requireRole(UserRole.TEACHER)
  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      assignments: {
        include: {
          department: true,
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  const assignments: ClassTestAssignmentOption[] = (profile?.assignments ?? []).map((assignment) => ({
    id: assignment.id,
    departmentId: assignment.departmentId,
    subjectId: assignment.subjectId,
    subjectName: assignment.subject.name,
    languageId: assignment.languageId,
    languageName: assignment.language.name,
    groupId: assignment.groupId,
    groupName: assignment.group.name,
    academicYearId: assignment.academicYearId,
    academicYearName: assignment.academicYear.name,
    semesterId: assignment.semesterId,
    semesterName: assignment.semester.name,
    academicOfferingId: assignment.academicOfferingId ?? null,
  }))

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Class Test</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Create Class Test</h1>
        <p className="mt-1 text-sm text-gray-500">Schedule a short, on-time assessment that stays completely separate from the Exam module.</p>
      </div>
      <ClassTestCreateForm assignments={assignments} />
    </div>
  )
}
