import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import TeacherSubstitutionForm from './TeacherSubstitutionForm'

export default async function TeacherSubstitutionsAdminPage() {
  const scope = await getAdminScope()
  const [substitutions, assignments, teachers] = await Promise.all([
    prisma.teacherSubstitution.findMany({
      where: scope.isSuperAdmin ? undefined : { teachingAssignment: { departmentId: { in: scope.managedDepartmentIds } } },
      include: {
        originalTeacher: { include: { user: true } },
        substituteTeacher: { include: { user: true } },
        teachingAssignment: {
          include: {
            academicOffering: {
              include: { subject: true, group: true },
            },
          },
        },
      },
      orderBy: { startsAt: 'desc' },
    }),
    prisma.teachingAssignment.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: {
        teacher: { include: { user: true } },
        academicOffering: { include: { subject: true, group: true, language: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.teacherProfile.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: { user: true, department: true },
      orderBy: { user: { name: 'asc' } },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Teacher Substitutions</h1>
        <p className="mt-1 text-gray-500">Temporary teacher coverage, approval visibility, and substitute access history.</p>
      </div>

      <TeacherSubstitutionForm
        assignments={assignments.map((assignment) => ({
          id: assignment.id,
          label: `${assignment.academicOffering.subject.name} / ${assignment.academicOffering.group.name} / ${assignment.teacher.user.name}`,
          originalTeacherId: assignment.teacherId,
        }))}
        teachers={teachers.map((teacher) => ({ id: teacher.id, label: `${teacher.user.name} (${teacher.department.name})` }))}
      />

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="px-5 py-3">Subject</th>
              <th className="px-5 py-3">Original</th>
              <th className="px-5 py-3">Substitute</th>
              <th className="px-5 py-3">Dates</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {substitutions.map((substitution) => (
              <tr key={substitution.id}>
                <td className="px-5 py-4 text-sm text-gray-700">
                  {substitution.teachingAssignment.academicOffering.subject.name}
                  <div className="text-xs text-gray-400">{substitution.teachingAssignment.academicOffering.group.name}</div>
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">{substitution.originalTeacher.user.name}</td>
                <td className="px-5 py-4 text-sm text-gray-600">{substitution.substituteTeacher.user.name}</td>
                <td className="px-5 py-4 text-sm text-gray-600">
                  {substitution.startsAt.toLocaleDateString()} - {substitution.endsAt.toLocaleDateString()}
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">{substitution.status.replaceAll('_', ' ')}</td>
              </tr>
            ))}
            {substitutions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                  No teacher substitutions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
