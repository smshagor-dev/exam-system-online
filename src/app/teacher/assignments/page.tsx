import { TeachingAssignmentStatus, UserRole } from '@prisma/client/index'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTeacherProfileByUserId } from '@/lib/teacher-assignment'

export default async function TeacherAssignmentsPage() {
  const session = await requireRole(UserRole.TEACHER)
  const profile = await getTeacherProfileByUserId(session.user.id)

  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  const [teachingAssignments, legacyAssignments] = await Promise.all([
    prisma.teachingAssignment.findMany({
      where: { teacherId: profile.id },
      include: {
        academicOffering: {
          include: {
            subject: true,
            language: true,
            group: true,
            programYear: true,
            semester: true,
            program: true,
            academicSession: true,
          },
        },
        roles: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.teacherAssignment.findMany({
      where: { teacherId: profile.id },
      include: {
        department: true,
        subject: true,
        language: true,
        group: true,
        academicYear: true,
        semester: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Assignments</h1>
        <p className="mt-1 text-gray-500">
          Home department: <span className="font-medium text-gray-700">{profile.departmentId}</span>
        </p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Normalized Teaching Assignments</h2>
          <span className="text-sm text-gray-500">{teachingAssignments.length} record(s)</span>
        </div>

        {teachingAssignments.length === 0 ? (
          <EmptyCard title="No normalized assignments yet" body="Legacy teacher assignments are still available below." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teachingAssignments.map((assignment) => (
              <div key={assignment.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{assignment.academicOffering.subject.name}</h3>
                    <p className="text-xs text-gray-500">{assignment.academicOffering.program.name}</p>
                  </div>
                  <StatusBadge status={assignment.status} />
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-600">
                  <p>{assignment.academicOffering.group.name} • {assignment.academicOffering.language.name}</p>
                  <p>{assignment.academicOffering.programYear.name} • {assignment.academicOffering.semester.name}</p>
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
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Legacy Assignments</h2>
          <span className="text-sm text-gray-500">{legacyAssignments.length} record(s)</span>
        </div>

        {legacyAssignments.length === 0 ? (
          <EmptyCard title="No legacy assignments" body="Ask your department admin to assign you to an academic offering." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {legacyAssignments.map((assignment) => (
              <div key={assignment.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{assignment.subject.name}</h3>
                    <p className="text-xs text-gray-500">{assignment.department.name}</p>
                  </div>
                  <StatusBadge status={TeachingAssignmentStatus.ACTIVE} />
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-600">
                  <p>{assignment.group.name} • {assignment.language.name}</p>
                  <p>{assignment.academicYear.name} • {assignment.semester.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm text-gray-500">{body}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: TeachingAssignmentStatus }) {
  const styles: Record<TeachingAssignmentStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-indigo-100 text-indigo-700',
    ACTIVE: 'bg-green-100 text-green-700',
    SUSPENDED: 'bg-orange-100 text-orange-700',
    COMPLETED: 'bg-blue-100 text-blue-700',
    CANCELLED: 'bg-rose-100 text-rose-700',
    REJECTED: 'bg-red-100 text-red-700',
  }

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${styles[status]}`}>
      {status.replaceAll('_', ' ')}
    </span>
  )
}
