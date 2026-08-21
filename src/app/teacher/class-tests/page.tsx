import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { listClassTestsByTeacher, listClassTestAttempts } from '@/lib/class-test-store'
import { getClassTestLifecycle } from '@/lib/class-test-service'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function lifecycleClass(lifecycle: string) {
  if (lifecycle === 'LIVE') return 'bg-green-100 text-green-700'
  if (lifecycle === 'UPCOMING') return 'bg-blue-100 text-blue-700'
  if (lifecycle === 'CLOSED') return 'bg-gray-100 text-gray-700'
  return 'bg-red-100 text-red-700'
}

export default async function TeacherClassTestsPage() {
  const session = await requireRole(UserRole.TEACHER)
  const tests = await listClassTestsByTeacher(session.user.id)
  const subjectIds = [...new Set(tests.map((test) => test.subjectId))]
  const groupIds = [...new Set(tests.map((test) => test.groupId))]
  const [subjects, groups, attemptsByTest] = await Promise.all([
    prisma.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true, code: true } }),
    prisma.group.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true } }),
    Promise.all(tests.map(async (test) => [test.id, await listClassTestAttempts(test.id)] as const)),
  ])
  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject]))
  const groupMap = new Map(groups.map((group) => [group.id, group]))
  const attemptMap = new Map(attemptsByTest)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Assessment</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Class Tests</h1>
          <p className="mt-1 text-sm text-gray-500">Short scheduled tests with their own attempts and results, separate from Exams.</p>
        </div>
        <Link href="/teacher/class-tests/create" className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">+ Create Class Test</Link>
      </div>

      {tests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-14 text-center">
          <h2 className="text-lg font-semibold text-gray-900">No class tests yet</h2>
          <p className="mt-1 text-sm text-gray-500">Create Test 1 for one of your assigned classes.</p>
          <Link href="/teacher/class-tests/create" className="mt-4 inline-flex rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white">Create Test</Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tests.map((test) => {
            const lifecycle = getClassTestLifecycle(test)
            const attempts = attemptMap.get(test.id) ?? []
            const pending = attempts.filter((attempt) => attempt.resultStatus === 'PENDING_REVIEW').length
            const published = attempts.filter((attempt) => attempt.resultStatus === 'PUBLISHED').length
            const subject = subjectMap.get(test.subjectId)
            return (
              <Link key={test.id} href={`/teacher/class-tests/${test.id}`} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">{subject?.code ?? 'CLASS TEST'} · {groupMap.get(test.groupId)?.name ?? 'Group'}</p>
                    <h2 className="mt-1 text-lg font-bold text-gray-900">Test {test.testNumber} — {formatDate(test.startTime)}</h2>
                    {test.title !== `Test ${test.testNumber}` && <p className="mt-1 text-sm text-gray-600">{test.title}</p>}
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${lifecycleClass(lifecycle)}`}>{lifecycle}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-gray-50 p-3"><p className="font-bold text-gray-900">{test.questionsPerStudent}</p><p className="text-xs text-gray-500">Questions</p></div>
                  <div className="rounded-xl bg-gray-50 p-3"><p className="font-bold text-gray-900">{test.duration}m</p><p className="text-xs text-gray-500">Duration</p></div>
                  <div className="rounded-xl bg-gray-50 p-3"><p className="font-bold text-gray-900">{test.totalMarks}</p><p className="text-xs text-gray-500">Marks</p></div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{attempts.length} attempts</span>
                  {pending > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700">{pending} need review</span>}
                  {published > 0 && <span className="rounded-full bg-green-100 px-2.5 py-1 text-green-700">{published} published</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
