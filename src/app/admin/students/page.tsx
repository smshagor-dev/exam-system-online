import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import StudentProgressDirectory from '@/components/students/StudentProgressDirectory'
import { getStudentDirectory } from '@/services/student-progress.service'

export default async function AdminStudentsPage() {
  const scope = await getAdminScope()

  const [students, years, groups, languages] = await Promise.all([
    getStudentDirectory({ userId: scope.session.user.id, role: scope.session.user.role }),
    prisma.academicYear.findMany({ orderBy: { year: 'asc' }, select: { id: true, name: true } }),
    prisma.group.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.language.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])

  return (
    <StudentProgressDirectory
      title="Students"
      subtitle={scope.isSuperAdmin ? 'All students with full progress and academic info.' : 'Students in your managed departments with full progress and academic info.'}
      initialStudents={students}
      years={years}
      groups={groups}
      languages={languages}
      detailBasePath="/admin/students"
    />
  )
}
