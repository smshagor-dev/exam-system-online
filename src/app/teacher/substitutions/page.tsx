import { UserRole } from '@prisma/client/index'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTeacherProfileByUserId } from '@/lib/teacher-assignment'

export default async function TeacherSubstitutionsPage() {
  const session = await requireRole(UserRole.TEACHER)
  const profile = await getTeacherProfileByUserId(session.user.id)

  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  const substitutions = await prisma.teacherSubstitution.findMany({
    where: {
      OR: [
        { originalTeacherId: profile.id },
        { substituteTeacherId: profile.id },
      ],
    },
    include: {
      originalTeacher: { include: { user: true } },
      substituteTeacher: { include: { user: true } },
      teachingAssignment: {
        include: {
          academicOffering: {
            include: {
              subject: true,
              group: true,
            },
          },
        },
      },
    },
    orderBy: { startsAt: 'desc' },
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Substitutions</h1>
        <p className="mt-1 text-gray-500">Temporary coverage and replacement history for your assignments.</p>
      </div>

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
                  No substitutions recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
