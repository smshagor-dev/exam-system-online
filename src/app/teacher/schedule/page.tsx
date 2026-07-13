import { UserRole } from '@prisma/client/index'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTeacherProfileByUserId } from '@/lib/teacher-assignment'

export default async function TeacherSchedulePage() {
  const session = await requireRole(UserRole.TEACHER)
  const profile = await getTeacherProfileByUserId(session.user.id)

  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  const assignments = await prisma.teachingAssignment.findMany({
    where: { teacherId: profile.id },
    include: {
      academicOffering: {
        include: {
          subject: true,
          language: true,
          group: true,
          semester: true,
        },
      },
      roles: true,
    },
    orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        <p className="mt-1 text-gray-500">Assignment timeline grouped by offering date range.</p>
      </div>

      <div className="space-y-4">
        {assignments.map((assignment) => (
          <div key={assignment.id} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">{assignment.academicOffering.subject.name}</h2>
                <p className="text-sm text-gray-500">
                  {assignment.academicOffering.group.name} • {assignment.academicOffering.language.name} • {assignment.academicOffering.semester.name}
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                {assignment.status.replaceAll('_', ' ')}
              </span>
            </div>
            <div className="mt-3 text-sm text-gray-600">
              <p>
                {assignment.startsAt ? assignment.startsAt.toLocaleDateString() : 'Open start'} -{' '}
                {assignment.endsAt ? assignment.endsAt.toLocaleDateString() : 'Open end'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {assignment.roles.map((role) => (
                  <span key={role.id} className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                    {role.role.replaceAll('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
        {assignments.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-400">
            No normalized teaching assignments available for schedule view.
          </div>
        )}
      </div>
    </div>
  )
}
