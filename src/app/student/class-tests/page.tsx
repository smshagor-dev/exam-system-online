import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { listStudentClassTests } from '@/lib/class-test-service'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function statusStyle(value: string) {
  if (value === 'LIVE') return 'bg-green-100 text-green-700'
  if (value === 'UPCOMING') return 'bg-blue-100 text-blue-700'
  if (value === 'CLOSED') return 'bg-gray-100 text-gray-700'
  return 'bg-red-100 text-red-700'
}

export default async function StudentClassTestsPage() {
  const session = await requireRole(UserRole.STUDENT)
  const entries = await listStudentClassTests(session.user.id)
  const subjects = await prisma.subject.findMany({
    where: { id: { in: [...new Set(entries.map((entry) => entry.test.subjectId))] } },
    select: { id: true, name: true, code: true },
  })
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]))

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">Assessment</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Class Tests</h1>
        <p className="mt-1 text-sm text-gray-500">Class tests can only be started during their scheduled time window. Submitted results stay separate from Exam Results.</p>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-14 text-center">
          <h2 className="font-semibold text-gray-900">No class tests assigned</h2>
          <p className="mt-1 text-sm text-gray-500">Scheduled tests for your current subjects will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map(({ test, attempt, lifecycle }) => {
            const subject = subjectMap.get(test.subjectId)
            const resultPublished = attempt?.resultStatus === 'PUBLISHED'
            const pendingReview = attempt?.resultStatus === 'PENDING_REVIEW'
            const missed = lifecycle === 'CLOSED' && !attempt
            return (
              <Link key={test.id} href={`/student/class-tests/${test.id}`} className="block rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">{subject?.code ?? 'CLASS TEST'}</p>
                    <h2 className="mt-1 text-lg font-bold text-gray-900">Test {test.testNumber} — {formatDate(test.startTime)}</h2>
                    {test.title !== `Test ${test.testNumber}` && <p className="mt-1 text-sm text-gray-600">{test.title}</p>}
                    <p className="mt-1 text-sm text-gray-500">{subject?.name} · {test.duration} min · {test.questionsPerStudent} questions · {test.totalMarks} marks</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(lifecycle)}`}>{lifecycle}</span>
                    {attempt?.status === 'IN_PROGRESS' && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">RESUME</span>}
                    {resultPublished && <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">RESULT READY</span>}
                    {pendingReview && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">RESULT PENDING</span>}
                    {missed && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">MISSED</span>}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Available Until</p><p className="mt-1 text-sm font-semibold text-gray-900">{formatDate(test.endTime)}</p></div>
                  <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Pass Marks</p><p className="mt-1 text-sm font-semibold text-gray-900">{test.passingMarks}/{test.totalMarks}</p></div>
                  <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Attempt</p><p className="mt-1 text-sm font-semibold text-gray-900">{attempt ? attempt.status.replaceAll('_', ' ') : 'Not started'}</p></div>
                  <div className={`rounded-xl p-3 ${resultPublished ? 'bg-green-50' : 'bg-gray-50'}`}><p className="text-xs text-gray-500">Result</p><p className={`mt-1 text-sm font-semibold ${resultPublished ? 'text-green-700' : 'text-gray-900'}`}>{resultPublished ? `${attempt?.marksObtained ?? 0}/${test.totalMarks} · ${attempt?.isPassed ? 'Pass' : 'Fail'}` : pendingReview ? 'Teacher review' : '—'}</p></div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
