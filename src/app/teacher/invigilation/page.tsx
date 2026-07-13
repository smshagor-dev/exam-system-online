import { requireRole } from '@/lib/auth'
import { getInvigilationDashboard } from '@/lib/phase8-scheduling'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export default async function TeacherInvigilationPage() {
  const session = await requireRole(UserRole.TEACHER)
  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { departmentId: true },
  })

  const dashboard = await getInvigilationDashboard({
    departmentId: teacher?.departmentId,
    teacherUserId: session.user.id,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Invigilation Dashboard</h1>
        <p className="mt-1 text-gray-500">Live invigilation summary, attendance totals, warnings, and incidents for your assigned duties.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Running Exams</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{dashboard.runningCount}</p>
        </div>
      </div>

      <div className="grid gap-4">
        {dashboard.runningItems.map((item) => (
          <div key={item.id} className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{item.subjectName}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {item.groupName} · {item.roomName} · {new Date(item.scheduledStart).toLocaleString()}
                </p>
              </div>
              <div className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                {item.incidents} incidents
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">Present: {item.attendance.present}</div>
              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">Absent: {item.attendance.absent}</div>
              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">Late: {item.attendance.late}</div>
              <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-700">Warnings: {item.malpracticeWarnings}</div>
            </div>
          </div>
        ))}
        {dashboard.runningItems.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
            No invigilation duties are active right now.
          </div>
        )}
      </div>
    </div>
  )
}

