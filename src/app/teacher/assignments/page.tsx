import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export default async function TeacherAssignmentsPage() {
  const session = await requireRole(UserRole.TEACHER)

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      department: true,
      assignments: {
        include: {
          department: true,
          subject: true,
          language: true,
          group: true,
          academicYear: true,
          semester: true,
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Assignments</h1>
        <p className="text-gray-500 mt-1">
          Department: <span className="font-medium text-gray-700">{profile.department.name}</span>
          {' · '}{profile.assignments.length} subject assignment{profile.assignments.length !== 1 ? 's' : ''}
        </p>
      </div>

      {profile.assignments.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-16 text-center">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Assignments Yet</h2>
          <p className="text-gray-500">
            Ask your department admin to assign you to subjects and groups.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {profile.assignments.map((assignment) => (
            <div key={assignment.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                  {assignment.subject.name.charAt(0)}
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
              </div>
              <h3 className="font-semibold text-gray-900">{assignment.subject.name}</h3>
              <p className="text-xs text-gray-500 font-mono mt-0.5">{assignment.subject.code}</p>
              <div className="mt-3 space-y-1">
                <InfoRow icon="🌐" label="Language" value={assignment.language.name} />
                <InfoRow icon="👥" label="Group" value={assignment.group.name} />
                <InfoRow icon="📅" label="Year" value={assignment.academicYear.name} />
                <InfoRow icon="🗂" label="Semester" value={assignment.semester.name} />
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100 flex gap-2">
                <a
                  href={`/teacher/questions?subjectId=${assignment.subject.id}&groupId=${assignment.group.id}&academicYearId=${assignment.academicYear.id}&semesterId=${assignment.semester.id}`}
                  className="flex-1 text-center text-xs py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium transition"
                >
                  Questions
                </a>
                <a
                  href="/teacher/exams/create"
                  className="flex-1 text-center text-xs py-1.5 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 font-medium transition"
                >
                  Create Exam
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <span>{icon}</span>
      <span className="text-gray-400">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
