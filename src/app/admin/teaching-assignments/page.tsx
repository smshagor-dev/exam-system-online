import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import { getAllowedAssignmentActions } from '@/lib/teaching-assignment-admin'
import AssignmentCreateForm from './AssignmentCreateForm'
import TeachingAssignmentActionButtons from './TeachingAssignmentActionButtons'

export default async function TeachingAssignmentsPage() {
  const scope = await getAdminScope()
  const [assignments, teachers, departments, offerings, memberships] = await Promise.all([
    prisma.teachingAssignment.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: {
        teacher: { include: { user: true } },
        department: true,
        academicOffering: {
          include: { subject: true, group: true, language: true, semester: true, program: true, academicSession: true },
        },
        roles: true,
        approvals: {
          include: { actor: true },
          orderBy: { createdAt: 'desc' },
        },
        auditLogs: {
          include: { actor: true },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.teacherProfile.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: { user: true, department: true },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.department.findMany({
      where: scope.isSuperAdmin ? undefined : { id: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.academicOffering.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: { subject: true, group: true, language: true, semester: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.teacherDepartmentMembership.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: { teacher: { include: { user: true } }, department: true },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teaching Assignments</h1>
        <p className="mt-1 text-gray-500">Offering-based teacher assignments with full approval workflow, audit history, and status controls.</p>
      </div>

      <AssignmentCreateForm
        teachers={teachers.map((teacher) => ({ id: teacher.id, label: `${teacher.user.name} (${teacher.department.name})` }))}
        departments={departments.map((department) => ({ id: department.id, label: department.name }))}
        offerings={offerings.map((offering) => ({
          id: offering.id,
          label: `${offering.subject.name} / ${offering.group.name} / ${offering.language.name} / ${offering.semester.name}`,
          departmentId: offering.departmentId,
        }))}
        memberships={memberships.map((membership) => ({
          id: membership.id,
          label: `${membership.teacher.user.name} / ${membership.department.name}${membership.isPrimary ? ' / Primary' : ''}`,
          teacherId: membership.teacherId,
          departmentId: membership.departmentId,
        }))}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {assignments.map((assignment) => (
          <div key={assignment.id} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">{assignment.academicOffering.subject.name}</h2>
                <p className="text-sm text-gray-500">{assignment.teacher.user.name}</p>
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                {assignment.status.replaceAll('_', ' ')}
              </span>
            </div>
            <div className="mt-3 space-y-1 text-sm text-gray-600">
              <p>{assignment.department.name}</p>
              <p>{assignment.academicOffering.group.name} / {assignment.academicOffering.language.name}</p>
              <p>{assignment.academicOffering.semester.name} / {assignment.academicOffering.program.name}</p>
              <p>{assignment.academicOffering.academicSession.name}</p>
              <p>Weekly hours: {assignment.weeklyHours}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {assignment.roles.map((role) => (
                <span key={role.id} className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                  {role.role.replaceAll('_', ' ')}
                </span>
              ))}
            </div>

            <div className="mt-4 border-t border-gray-100 pt-4">
              <TeachingAssignmentActionButtons
                assignmentId={assignment.id}
                allowedActions={getAllowedAssignmentActions(assignment.status)}
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Approval History</h3>
                <div className="mt-2 space-y-2">
                  {assignment.approvals.map((approval) => (
                    <div key={approval.id} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      <p className="font-medium text-gray-800">{approval.statusTo.replaceAll('_', ' ')}</p>
                      <p>{approval.actor?.name ?? 'System'}{approval.statusFrom ? ` from ${approval.statusFrom.replaceAll('_', ' ')}` : ''}</p>
                      <p>{approval.notes ?? 'No notes'}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Audit History</h3>
                <div className="mt-2 space-y-2">
                  {assignment.auditLogs.map((log) => (
                    <div key={log.id} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      <p className="font-medium text-gray-800">{log.action}</p>
                      <p>{log.actor?.name ?? 'System'}</p>
                      <p className="break-words">{log.details ?? 'No details'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
        {assignments.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-400">
            No teaching assignments found.
          </div>
        )}
      </div>
    </div>
  )
}
