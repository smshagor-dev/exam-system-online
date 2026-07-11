import { UserRole } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAdminScope } from '@/lib/admin-scope'
import StudentLifecycleTable from '@/components/admin/StudentLifecycleTable'

export default async function StudentTimelinePage() {
  await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)
  const scope = await getAdminScope()
  const students = await prisma.studentProfile.findMany({
    where: scope.isSuperAdmin ? {} : { departmentId: { in: scope.managedDepartmentIds } },
    include: {
      user: true,
      academicHistory: {
        orderBy: { occurredAt: 'desc' },
        take: 1,
      },
      enrollments: {
        where: { isActive: true },
        orderBy: { enrolledAt: 'desc' },
        take: 1,
        include: { program: true, group: true, semester: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  return (
    <StudentLifecycleTable
      title="Student Timeline Snapshot"
      description="Quick overview of each student’s current lifecycle state and latest timeline event."
      columns={[
        { key: 'student', label: 'Student' },
        { key: 'program', label: 'Current Program' },
        { key: 'group', label: 'Current Group' },
        { key: 'semester', label: 'Current Semester' },
        { key: 'latestEvent', label: 'Latest Event' },
        { key: 'eventDate', label: 'Event Date' },
      ]}
      rows={students.map((student) => ({
        student: student.user.name,
        program: student.enrollments[0]?.program.name ?? '-',
        group: student.enrollments[0]?.group.name ?? '-',
        semester: student.enrollments[0]?.semester.name ?? '-',
        latestEvent: student.academicHistory[0]?.eventType ?? '-',
        eventDate: student.academicHistory[0]?.occurredAt.toISOString().slice(0, 10) ?? '-',
      }))}
    />
  )
}
