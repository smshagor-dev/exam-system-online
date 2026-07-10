import Link from 'next/link'
import { BarChart3, CalendarDays, CheckCircle2, ChevronLeft, XCircle } from 'lucide-react'
import type { StudentSelfProgressSubjectPage } from '@/services/student-progress.service'

type Props = {
  data: StudentSelfProgressSubjectPage
}

function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`
}

function formatDate(value?: string | null) {
  if (!value) return 'No activity yet'

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function statusTone(value: number) {
  if (value >= 80) return 'text-emerald-600'
  if (value >= 50) return 'text-amber-600'
  return 'text-rose-600'
}

export default function StudentSubjectProgressPage({ data }: Props) {
  const { subject } = data

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <Link
          href="/student/progress"
          className="inline-flex items-center gap-2 text-sm font-medium text-violet-700 transition hover:text-violet-800"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Progress
        </Link>

        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700">{subject.academicYearName}</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{subject.subjectName}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {subject.semesterName} · {subject.groupName} · {subject.languageName}
            </p>
            <p className="mt-3 text-sm font-medium text-slate-700">Student: {data.studentName}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Department</p>
              <p className="mt-1 font-semibold text-slate-900">{data.departmentName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Course</p>
              <p className="mt-1 font-semibold text-slate-900">{data.course || 'Not set'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Eligible Exams" value={subject.eligibleExamCount} />
        <MetricCard label="Attempts" value={subject.attemptsCount} />
        <MetricCard label="Completed" value={subject.completedAttemptsCount} />
        <MetricCard label="Published" value={subject.publishedResultsCount} />
        <MetricCard label="Average Score" value={formatPercentage(subject.averageScore)} highlight={statusTone(subject.averageScore)} />
        <MetricCard label="Pass Rate" value={formatPercentage(subject.passRate)} highlight={statusTone(subject.passRate)} />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Subject Summary</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <InfoRow label="Academic Year" value={subject.academicYearName} />
            <InfoRow label="Semester" value={subject.semesterName} />
            <InfoRow label="Group" value={subject.groupName} />
            <InfoRow label="Language" value={subject.languageName} />
            <InfoRow label="Pending Results" value={subject.pendingResultCount} />
            <InfoRow label="Last Activity" value={formatDate(subject.latestActivity)} />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Published Results</h2>
          <div className="mt-4 space-y-3">
            {subject.results.map((result) => (
              <div key={result.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">{result.examTitle}</p>
                    <p className="mt-1 text-xs text-slate-500">Published: {formatDate(result.publishedAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-base font-bold ${statusTone(result.percentage)}`}>{formatPercentage(result.percentage)}</p>
                    <p className="text-xs text-slate-500">{result.marksObtained}/{result.totalMarks}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">{result.status}</span>
                  <span className={`inline-flex items-center gap-1 ${result.isPassed ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {result.isPassed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {result.isPassed ? 'Passed' : 'Failed'}
                  </span>
                </div>
              </div>
            ))}
            {subject.results.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
                No result entries for this subject yet.
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-violet-50 p-3 text-violet-600">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Attempt History</h2>
            <p className="text-sm text-slate-500">Every exam attempt under this subject scope</p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <th className="px-4 py-3">Exam</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-600">
              {subject.attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{attempt.examTitle}</td>
                  <td className="px-4 py-3">{subject.academicYearName}</td>
                  <td className="px-4 py-3">{attempt.status}</td>
                  <td className="px-4 py-3">{formatDate(attempt.startedAt)}</td>
                  <td className="px-4 py-3">{formatDate(attempt.submittedAt)}</td>
                  <td className="px-4 py-3">
                    {attempt.resultPercentage !== null ? formatPercentage(attempt.resultPercentage) : 'Pending'}
                  </td>
                </tr>
              ))}
              {subject.attempts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    No attempts for this subject yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-violet-50 p-3 text-violet-600">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Performance Snapshot</h2>
              <p className="text-sm text-slate-500">Quick overview of this subject</p>
            </div>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <InfoRow label="Average Score" value={formatPercentage(subject.averageScore)} />
            <InfoRow label="Pass Rate" value={formatPercentage(subject.passRate)} />
            <InfoRow label="Eligible Exams" value={subject.eligibleExamCount} />
            <InfoRow label="Attempt Count" value={subject.attemptsCount} />
          </div>
        </div>
      </section>
    </div>
  )
}

function MetricCard({ label, value, highlight }: { label: string; value: string | number; highlight?: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold text-slate-900 ${highlight ?? ''}`}>{value}</p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-900">{value}</span>
    </div>
  )
}
