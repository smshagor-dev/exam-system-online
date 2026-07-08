import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import AdminDashboardView from '@/components/admin/AdminDashboardView'

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
type DashboardExamStatus = 'Upcoming' | 'Scheduled'

export default async function AdminDashboardPage() {
  const scope = await getAdminScope()
  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1)
  const departmentScope = scope.isSuperAdmin ? {} : { departmentId: { in: scope.managedDepartmentIds } }

  const [
    students,
    teachers,
    subjects,
    exams,
    results,
    departments,
    groups,
    academicYears,
    yearlyExams,
    latestExams,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'STUDENT', ...(scope.isSuperAdmin ? {} : { studentProfile: { departmentId: { in: scope.managedDepartmentIds } } }) } }),
    prisma.user.count({ where: { role: 'TEACHER', ...(scope.isSuperAdmin ? {} : { teacherProfile: { departmentId: { in: scope.managedDepartmentIds } } }) } }),
    prisma.subject.count({ where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } } }),
    prisma.exam.count({ where: departmentScope }),
    prisma.examResult.count({ where: scope.isSuperAdmin ? undefined : { exam: { departmentId: { in: scope.managedDepartmentIds } } } }),
    prisma.department.count({ where: scope.isSuperAdmin ? undefined : { id: { in: scope.managedDepartmentIds } } }),
    prisma.group.count(),
    prisma.academicYear.count(),
    prisma.exam.findMany({
      where: {
        ...departmentScope,
        startTime: {
          gte: yearStart,
          lt: yearEnd,
        },
      },
      select: {
        startTime: true,
      },
    }),
    prisma.exam.findMany({
      where: departmentScope,
      take: 4,
      orderBy: { startTime: 'desc' },
      include: {
        subject: {
          select: {
            name: true,
          },
        },
      },
    }),
  ])

  const monthlyCounts = Array.from({ length: 12 }, () => 0)
  for (const exam of yearlyExams) {
    monthlyCounts[exam.startTime.getMonth()] += 1
  }

  const overviewData = monthLabels.map((month, index) => ({
    month,
    value: monthlyCounts[index],
  }))

  const recentExams: Array<{
    name: string
    subject: string
    date: string
    status: DashboardExamStatus
  }> = latestExams.map((exam) => ({
    name: exam.title,
    subject: exam.subject.name,
    date: exam.startTime.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    status: exam.startTime > now ? 'Upcoming' : 'Scheduled',
  }))

  return (
    <AdminDashboardView
      adminName={scope.session.user.name}
      kpis={{
        students: students.toLocaleString(),
        teachers: teachers.toLocaleString(),
        subjects: subjects.toLocaleString(),
        exams: exams.toLocaleString(),
        results: results.toLocaleString(),
      }}
      overviewData={overviewData}
      recentExams={recentExams}
      systemStats={{
        departments: departments.toLocaleString(),
        subjects: subjects.toLocaleString(),
        groups: groups.toLocaleString(),
        academicYears: academicYears.toLocaleString(),
      }}
    />
  )
}
