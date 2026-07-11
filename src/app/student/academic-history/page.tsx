import { UserRole } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { getStudentTimeline } from '@/lib/student-lifecycle'
import { prisma } from '@/lib/prisma'

export default async function StudentAcademicHistoryPage() {
  const session = await requireRole(UserRole.STUDENT)
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!profile) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">Student profile not configured.</div>
  }

  const timeline = await getStudentTimeline(profile.id)
  const safeTimeline = timeline.map((item) => ({
    id: item.id,
    eventType: item.eventType,
    reason: item.reason,
    occurredAt: item.occurredAt,
    notes: item.eventType === 'MANUAL_CORRECTION' ? null : item.notes,
    fromProgram: item.fromProgram?.name ?? null,
    toProgram: item.toProgram?.name ?? null,
    fromGroup: item.fromGroup?.name ?? null,
    toGroup: item.toGroup?.name ?? null,
    fromAcademicSession: item.fromAcademicSession?.name ?? null,
    toAcademicSession: item.toAcademicSession?.name ?? null,
    fromStatus: item.fromStatus,
    toStatus: item.toStatus,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Academic History</h1>
        <p className="mt-1 text-sm text-gray-500">Your full academic lifecycle from admission through promotion, transfer, leave, and graduation milestones.</p>
      </div>

      <div className="space-y-4">
        {safeTimeline.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">No academic history records are available yet.</div>
        ) : safeTimeline.map((item) => (
          <article key={item.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{item.eventType.replaceAll('_', ' ')}</h2>
                <p className="mt-1 text-sm text-gray-500">{item.reason || 'Lifecycle update recorded'}</p>
              </div>
              <p className="text-sm text-gray-500">{item.occurredAt.toISOString().slice(0, 10)}</p>
            </div>
            <div className="mt-4 grid gap-3 text-sm text-gray-700 md:grid-cols-2">
              <p>Program: {item.fromProgram ?? '-'} {'->'} {item.toProgram ?? '-'}</p>
              <p>Group: {item.fromGroup ?? '-'} {'->'} {item.toGroup ?? '-'}</p>
              <p>Status: {item.fromStatus ?? '-'} {'->'} {item.toStatus ?? '-'}</p>
              <p>Session: {item.fromAcademicSession ?? '-'} {'->'} {item.toAcademicSession ?? '-'}</p>
            </div>
            {item.notes ? <p className="mt-3 text-sm text-gray-500">{item.notes}</p> : null}
          </article>
        ))}
      </div>
    </div>
  )
}
