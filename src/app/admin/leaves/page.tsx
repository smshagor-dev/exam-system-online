import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import StudentLifecycleActionWorkspace from '@/components/admin/StudentLifecycleActionWorkspace'

export default async function LeavesPage() {
  const scope = await getAdminScope()

  const [leaves, activeEnrollments] = await Promise.all([
    prisma.studentLeave.findMany({
      where: scope.isSuperAdmin ? undefined : { enrollment: { departmentId: { in: scope.managedDepartmentIds } } },
      include: {
        student: { include: { user: true } },
        enrollment: { include: { program: true, group: true } },
      },
      orderBy: { approvedAt: 'desc' },
    }),
    prisma.studentEnrollment.findMany({
      where: {
        status: 'ACTIVE',
        isActive: true,
        ...(scope.isSuperAdmin ? {} : { departmentId: { in: scope.managedDepartmentIds } }),
      },
      include: {
        student: { include: { user: true } },
        program: true,
        group: true,
      },
      orderBy: [{ programId: 'asc' }, { enrolledAt: 'desc' }],
    }),
  ])

  return (
    <StudentLifecycleActionWorkspace
      title="Leave Workflow"
      description="Place active students on medical, academic, temporary, or other approved leave while safely changing enrollment status and preserving history."
      actionEndpoint="/api/admin/leaves"
      actionLabel="Create leave"
      fields={[
        {
          key: 'studentId',
          label: 'Student',
          type: 'select',
          required: true,
          options: activeEnrollments.map((item) => ({
            value: item.studentId,
            label: `${item.student.user.name} (${item.program.name} / ${item.group.name})`,
          })),
        },
        { key: 'leaveType', label: 'Leave Type', type: 'select', required: true, options: ['MEDICAL', 'ACADEMIC', 'TEMPORARY', 'OTHER'].map((value) => ({ value, label: value })) },
        { key: 'startsAt', label: 'Start Date', type: 'date', required: true },
        { key: 'endsAt', label: 'Expected Return Date', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', required: true, options: ['APPROVED', 'PENDING', 'DOCUMENTED'].map((value) => ({ value, label: value })) },
        { key: 'reason', label: 'Reason', type: 'textarea' },
        { key: 'supportingNote', label: 'Supporting Note', type: 'textarea' },
        { key: 'notes', label: 'Approval / Internal Notes', type: 'textarea' },
      ]}
      recordsTitle="Leave Records"
      recordsDescription="Open leave overlap is blocked, enrollment status changes are recorded, and readmission closes the leave record."
      columns={[
        { key: 'student', label: 'Student' },
        { key: 'type', label: 'Type' },
        { key: 'program', label: 'Program' },
        { key: 'group', label: 'Group' },
        { key: 'startsAt', label: 'Starts' },
        { key: 'endsAt', label: 'Expected Return' },
        { key: 'readmittedAt', label: 'Readmitted' },
      ]}
      rows={leaves.map((item) => ({
        student: item.student.user.name,
        type: item.leaveType,
        program: item.enrollment.program.name,
        group: item.enrollment.group.name,
        startsAt: item.startsAt.toISOString().slice(0, 10),
        endsAt: item.endsAt?.toISOString().slice(0, 10) ?? '-',
        readmittedAt: item.readmittedAt?.toISOString().slice(0, 10) ?? '-',
      }))}
    />
  )
}
