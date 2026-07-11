import { UserRole } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAdminScope } from '@/lib/admin-scope'
import StudentLifecycleTable from '@/components/admin/StudentLifecycleTable'

export default async function AcademicHistoryPage() {
  await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)
  const scope = await getAdminScope()
  const items = await prisma.studentAcademicHistory.findMany({
    where: scope.isSuperAdmin ? {} : { toDepartmentId: { in: scope.managedDepartmentIds } },
    include: {
      student: { include: { user: true } },
      fromProgram: true,
      toProgram: true,
      fromGroup: true,
      toGroup: true,
    },
    orderBy: { occurredAt: 'desc' },
    take: 100,
  })

  return (
    <StudentLifecycleTable
      title="Academic History"
      description="Append-only history entries for every enrollment lifecycle change."
      columns={[
        { key: 'student', label: 'Student' },
        { key: 'event', label: 'Event' },
        { key: 'programs', label: 'Program Change' },
        { key: 'groups', label: 'Group Change' },
        { key: 'status', label: 'Status' },
        { key: 'occurredAt', label: 'Occurred' },
      ]}
      rows={items.map((item) => ({
        student: item.student.user.name,
        event: item.eventType,
        programs: `${item.fromProgram?.name ?? '-'} -> ${item.toProgram?.name ?? '-'}`,
        groups: `${item.fromGroup?.name ?? '-'} -> ${item.toGroup?.name ?? '-'}`,
        status: `${item.fromStatus ?? '-'} -> ${item.toStatus ?? '-'}`,
        occurredAt: item.occurredAt.toISOString().slice(0, 10),
      }))}
    />
  )
}
