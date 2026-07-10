import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import StudentProgressDirectory from '@/components/students/StudentProgressDirectory'
import { getStudentDirectory } from '@/services/student-progress.service'
import { UserRole } from '@prisma/client'

export default async function TeacherStudentsPage() {
  const session = await requireRole(UserRole.TEACHER)

  const [students, years, groups, languages] = await Promise.all([
    getStudentDirectory({ userId: session.user.id, role: session.user.role }),
    prisma.academicYear.findMany({ orderBy: { year: 'asc' }, select: { id: true, name: true } }),
    prisma.group.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.language.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])

  return (
    <StudentProgressDirectory
      title="My Students"
      subtitle="Students assigned under your teaching scope with full progress and exam history."
      initialStudents={students}
      years={years}
      groups={groups}
      languages={languages}
      detailBasePath="/teacher/students"
    />
  )
}
