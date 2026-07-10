'use client'

import Link from 'next/link'
import { BarChart3, BookOpen, CalendarDays, ChevronRight, GraduationCap } from 'lucide-react'
import type { StudentSelfProgressOverview } from '@/services/student-progress.service'

type Props = {
  data: StudentSelfProgressOverview
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

export default function StudentYearProgressBoard({ data }: Props) {
  const summaryCards = [
    { label: 'Years', value: data.years.length, icon: GraduationCap },
    { label: 'Subjects', value: data.totalSubjects, icon: BookOpen },
    { label: 'Eligible Exams', value: data.totalEligibleExams, icon: CalendarDays },
    { label: 'Average Score', value: formatPercentage(data.averageScore), icon: BarChart3 },
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700">Progress Center</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Year-Wise Subject Progress</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Track every academic year separately, then open any subject to see a full dedicated progress page.
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

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon

          return (
            <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{card.label}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900">{card.value}</p>
                </div>
                <div className="rounded-2xl bg-violet-50 p-3 text-violet-600">
                  <Icon className="h-6 w-6" />
                </div>
              </div>
            </div>
          )
        })}
      </section>

      <div className="space-y-6">
        {data.years.map((year) => (
          <section key={year.academicYearId} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{year.academicYearName}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {year.subjects.length} subject{year.subjects.length > 1 ? 's' : ''} enrolled in this year
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Average score:{' '}
                <span className={`font-semibold ${statusTone(year.subjects.length > 0 ? year.subjects.reduce((sum, subject) => sum + subject.averageScore, 0) / year.subjects.length : 0)}`}>
                  {formatPercentage(year.subjects.length > 0 ? year.subjects.reduce((sum, subject) => sum + subject.averageScore, 0) / year.subjects.length : 0)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {year.subjects.map((subject) => (
                <Link
                  key={subject.scopeId}
                  href={`/student/progress/${subject.scopeId}`}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-left transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-white hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{subject.subjectName}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {subject.semesterName} · {subject.groupName} · {subject.languageName}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                      Open
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-slate-400">Exams</p>
                      <p className="mt-1 font-semibold text-slate-900">{subject.eligibleExamCount}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-slate-400">Attempts</p>
                      <p className="mt-1 font-semibold text-slate-900">{subject.attemptsCount}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-slate-400">Results</p>
                      <p className="mt-1 font-semibold text-slate-900">{subject.publishedResultsCount}</p>
                    </div>
                    <div className="rounded-2xl bg-white p-3">
                      <p className="text-slate-400">Avg</p>
                      <p className={`mt-1 font-semibold ${statusTone(subject.averageScore)}`}>{formatPercentage(subject.averageScore)}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <p>Pass rate: <span className="font-semibold text-slate-800">{formatPercentage(subject.passRate)}</span></p>
                    <p>Last activity: <span className="font-semibold text-slate-800">{formatDate(subject.latestActivity)}</span></p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}

        {data.years.length === 0 && (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 shadow-sm">
            No subject progress found yet.
          </section>
        )}
      </div>
    </div>
  )
}
