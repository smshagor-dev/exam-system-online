import { TeacherWorkloadCategory, UserRole } from '@prisma/client/index'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getTeacherProfileByUserId } from '@/lib/teacher-assignment'
import { calculateTeacherWeeklyWorkload, getWorkloadBreakdown } from '@/lib/teacher-workload'

export default async function TeacherWorkloadPage() {
  const session = await requireRole(UserRole.TEACHER)
  const profile = await getTeacherProfileByUserId(session.user.id)

  if (!profile) {
    return <div className="py-20 text-center text-gray-500">Teacher profile not found.</div>
  }

  const [assignments, entries] = await Promise.all([
    prisma.teachingAssignment.findMany({
      where: { teacherId: profile.id },
      include: {
        academicOffering: { include: { subject: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.teacherWorkloadEntry.findMany({
      where: { teacherId: profile.id },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const weekly = calculateTeacherWeeklyWorkload(assignments, entries)
  const breakdown = getWorkloadBreakdown(entries)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Workload</h1>
        <p className="mt-1 text-gray-500">Weekly workload snapshot across normalized assignments and manual entries.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Weekly Hours" value={weekly.totalHours} />
        <MetricCard label="Assignment Hours" value={weekly.assignmentHours} />
        <MetricCard label="Manual Hours" value={weekly.manualHours} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Assignments</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="px-5 py-4 text-sm text-gray-600">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{assignment.academicOffering.subject.name}</p>
                    <p>{assignment.weeklyHours} weekly hours</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                    {assignment.status.replaceAll('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
            {assignments.length === 0 && <EmptyState message="No normalized teaching assignments found." />}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="font-semibold text-gray-900">Manual Breakdown</h2>
          </div>
          <div className="space-y-3 px-5 py-4 text-sm text-gray-600">
            {Object.values(TeacherWorkloadCategory).map((category) => (
              <div key={category} className="flex items-center justify-between">
                <span>{category.replaceAll('_', ' ')}</span>
                <span className="font-medium text-gray-900">{breakdown[category] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return <div className="px-5 py-8 text-center text-sm text-gray-400">{message}</div>
}
