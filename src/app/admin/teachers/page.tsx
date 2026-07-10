import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import TeacherManager from './TeacherManager'

export default async function TeachersPage() {
  const scope = await getAdminScope()

  const [teachers, departments, subjects, languages, groups, years, semesters] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: 'TEACHER',
        ...(scope.isSuperAdmin ? {} : { teacherProfile: { departmentId: { in: scope.managedDepartmentIds } } }),
      },
      include: {
        teacherProfile: {
          include: {
            department: true,
            assignments: {
              include: {
                subject: true,
                language: true,
                group: true,
                academicYear: true,
                semester: true,
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.department.findMany({
      where: scope.isSuperAdmin ? undefined : { id: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.subject.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.language.findMany({ orderBy: { name: 'asc' } }),
    prisma.group.findMany({ orderBy: [{ academicYearId: 'asc' }, { name: 'asc' }] }),
    prisma.academicYear.findMany({ orderBy: { year: 'asc' } }),
    prisma.semester.findMany({ orderBy: { number: 'asc' } }),
  ])

  return (
    <TeacherManager
      teachers={teachers}
      departments={departments}
      subjects={subjects}
      languages={languages}
      groups={groups}
      years={years}
      semesters={semesters}
      canCreateTeacher={scope.isSuperAdmin}
    />
  )
}
