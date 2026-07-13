import SimpleEntityManager from '@/components/admin/SimpleEntityManager'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export default async function ExamSchedulingPage() {
  await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)
  const [sessions, departments, programs, semesters, campuses, scheduleSessions, scheduleItems] = await Promise.all([
    prisma.academicSession.findMany({ where: { isActive: true }, orderBy: { startDate: 'desc' } }),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.academicProgram.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.semester.findMany({ where: { isActive: true }, orderBy: { number: 'asc' } }),
    prisma.examCampus.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.examSchedulingSession.findMany({ include: { items: true }, orderBy: { createdAt: 'desc' } }),
    prisma.examScheduleItem.findMany({
      include: {
        schedulingSession: true,
        subject: true,
        room: true,
        group: true,
      },
      orderBy: { scheduledStart: 'asc' },
    }),
  ])

  return (
    <div className="space-y-8">
      <SimpleEntityManager
        title="Scheduling Sessions"
        singularLabel="Scheduling Session"
        items={scheduleSessions.map((session) => ({
          id: session.id,
          name: session.name,
          academicSessionId: session.academicSessionId,
          departmentId: session.departmentId,
          programId: session.programId ?? '',
          semesterId: session.semesterId ?? '',
          campusId: session.campusId ?? '',
          type: session.type,
          status: session.status,
        }))}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'type', label: 'Type' },
          { key: 'status', label: 'Status' },
          { key: 'departmentId', label: 'Department' },
        ]}
        fields={[
          { key: 'name', label: 'Name', type: 'text', required: true },
          {
            key: 'academicSessionId',
            label: 'Academic Session',
            type: 'select',
            required: true,
            options: sessions.map((session) => ({ value: session.id, label: session.name })),
          },
          {
            key: 'departmentId',
            label: 'Department',
            type: 'select',
            required: true,
            options: departments.map((department) => ({ value: department.id, label: department.name })),
          },
          {
            key: 'programId',
            label: 'Program',
            type: 'select',
            options: [{ value: '', label: 'All Programs' }, ...programs.map((program) => ({ value: program.id, label: program.name }))],
          },
          {
            key: 'semesterId',
            label: 'Semester',
            type: 'select',
            options: [{ value: '', label: 'All Semesters' }, ...semesters.map((semester) => ({ value: semester.id, label: semester.name }))],
          },
          {
            key: 'campusId',
            label: 'Campus',
            type: 'select',
            options: [{ value: '', label: 'Any Campus' }, ...campuses.map((campus) => ({ value: campus.id, label: campus.name }))],
          },
          {
            key: 'type',
            label: 'Session Type',
            type: 'select',
            required: true,
            options: ['REGULAR', 'MIDTERM', 'FINAL', 'SUPPLEMENTARY', 'IMPROVEMENT', 'BACKLOG', 'RETAKE', 'PRACTICAL', 'LAB'].map((value) => ({ value, label: value })),
          },
          {
            key: 'status',
            label: 'Status',
            type: 'select',
            required: true,
            options: ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'LOCKED', 'RUNNING', 'COMPLETED', 'ARCHIVED'].map((value) => ({ value, label: value })),
          },
        ]}
        apiBase="/api/admin/exam-scheduling-sessions"
        formMode="modal"
      />

      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Scheduled Items</h2>
            <p className="mt-1 text-sm text-gray-500">
              Manual overrides, clash review, seat planning, invigilator assignment, attendance, and incidents are managed through the Phase 8 APIs for each scheduled item.
            </p>
          </div>
          <a
            href="/api/admin/exam-reports"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Open Reports JSON
          </a>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Group</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Room</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Start</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scheduleItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-sm text-gray-700">{item.subject.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{item.group.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{item.room?.name ?? 'Unassigned'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{item.scheduledStart.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{item.status}</td>
                </tr>
              ))}
              {scheduleItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                    No scheduled items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

