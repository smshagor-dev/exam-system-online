import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import TeacherDepartmentMembershipForm from './TeacherDepartmentMembershipForm'

export default async function TeacherDepartmentsPage() {
  const scope = await getAdminScope()
  const [memberships, teachers, departments] = await Promise.all([
    prisma.teacherDepartmentMembership.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: {
        teacher: { include: { user: true } },
        department: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
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
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teacher Department Memberships</h1>
        <p className="mt-1 text-gray-500">Cross-department teaching scope and primary membership tracking.</p>
      </div>

      <TeacherDepartmentMembershipForm
        teachers={teachers.map((teacher) => ({ id: teacher.id, label: `${teacher.user.name} (${teacher.department.name})` }))}
        departments={departments.map((department) => ({ id: department.id, label: department.name }))}
      />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-5 py-3">Teacher</th>
              <th className="px-5 py-3">Department</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Primary</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {memberships.map((membership) => (
              <tr key={membership.id}>
                <td className="px-5 py-4 text-sm text-gray-700">{membership.teacher.user.name}</td>
                <td className="px-5 py-4 text-sm text-gray-600">{membership.department.name}</td>
                <td className="px-5 py-4 text-sm text-gray-600">{membership.role || 'Member'}</td>
                <td className="px-5 py-4 text-sm text-gray-600">{membership.isPrimary ? 'Yes' : 'No'}</td>
                <td className="px-5 py-4 text-sm text-gray-600">{membership.isActive ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}
            {memberships.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                  No teacher department memberships found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
