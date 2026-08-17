'use client'

import Link from 'next/link'
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronRight,
  GraduationCap,
  History,
  Layers3,
} from 'lucide-react'
import type { StudentSelfProgressOverview } from '@/services/student-progress.service'

export type StudentActiveStudyContext = {
  departmentName: string
  academicSessionName: string
  programName: string
  programYearName: string
  programYearNumber: number
  academicYearId: string | null
  academicYearName: string
  academicYearNumber: number
  semesterName: string
  semesterNumber: number
  groupName: string
  languageName: string
}

type Props = {
  data: StudentSelfProgressOverview
  activeContext: StudentActiveStudyContext | null
}

type SubjectProgress = StudentSelfProgressOverview['years'][number]['subjects'][number]
type YearProgress = StudentSelfProgressOverview['years'][number]

type SemesterGroup = {
  name: string
  subjects: SubjectProgress[]
}

type HistoryYear = {
  academicYearId: string
  academicYearName: string
  academicYearNumber: number
  semesters: SemesterGroup[]
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

function semesterSortKey(name: string) {
  const numeric = name.match(/\d+/)?.[0]
  if (numeric) return Number(numeric)

  const normalized = name.trim().toLowerCase()
  const words: Record<string, number> = {
    first: 1,
    '1st': 1,
    second: 2,
    '2nd': 2,
    third: 3,
    '3rd': 3,
    fourth: 4,
    '4th': 4,
    fifth: 5,
    '5th': 5,
    sixth: 6,
    '6th': 6,
    seventh: 7,
    '7th': 7,
    eighth: 8,
    '8th': 8,
  }

  for (const [word, order] of Object.entries(words)) {
    if (normalized.includes(word)) return order
  }

  return Number.MAX_SAFE_INTEGER
}

function groupSubjectsBySemester(subjects: SubjectProgress[]): SemesterGroup[] {
  const semesterMap = new Map<string, SubjectProgress[]>()

  for (const subject of subjects) {
    const existing = semesterMap.get(subject.semesterName) ?? []
    existing.push(subject)
    semesterMap.set(subject.semesterName, existing)
  }

  return Array.from(semesterMap.entries())
    .map(([name, semesterSubjects]) => ({
      name,
      subjects: semesterSubjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
    }))
    .sort((a, b) => {
      const numericOrder = semesterSortKey(a.name) - semesterSortKey(b.name)
      return numericOrder !== 0 ? numericOrder : a.name.localeCompare(b.name)
    })
}

function matchesActiveContext(
  year: YearProgress,
  subject: SubjectProgress,
  activeContext: StudentActiveStudyContext | null
) {
  if (!activeContext) return false

  const yearMatches = activeContext.academicYearId
    ? year.academicYearId === activeContext.academicYearId
    : year.academicYearNumber === activeContext.academicYearNumber

  return (
    yearMatches &&
    subject.semesterName === activeContext.semesterName &&
    subject.groupName === activeContext.groupName &&
    subject.languageName === activeContext.languageName
  )
}

function SubjectCard({ subject, current = false }: { subject: SubjectProgress; current?: boolean }) {
  return (
    <Link
      href={`/student/progress/${subject.scopeId}`}
      className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md ${
        current
          ? 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-300'
          : 'border-slate-200 bg-slate-50 hover:border-violet-300'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-slate-900">{subject.subjectName}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {subject.groupName} · {subject.languageName}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            current ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'
          }`}
        >
          {current ? 'Current' : 'Open'}
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-white p-2.5">
          <p className="text-slate-400">Exams</p>
          <p className="mt-1 font-semibold text-slate-900">{subject.eligibleExamCount}</p>
        </div>
        <div className="rounded-xl bg-white p-2.5">
          <p className="text-slate-400">Results</p>
          <p className="mt-1 font-semibold text-slate-900">{subject.publishedResultsCount}</p>
        </div>
        <div className="rounded-xl bg-white p-2.5">
          <p className="text-slate-400">Average</p>
          <p className={`mt-1 font-semibold ${statusTone(subject.averageScore)}`}>
            {formatPercentage(subject.averageScore)}
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Last activity: <span className="font-medium text-slate-700">{formatDate(subject.latestActivity)}</span>
      </p>
    </Link>
  )
}

export default function StudentYearProgressBoard({ data, activeContext }: Props) {
  const currentSubjects = data.years.flatMap((year) =>
    year.subjects
      .filter((subject) => matchesActiveContext(year, subject, activeContext))
      .map((subject) => ({ ...subject, academicYearId: year.academicYearId }))
  )

  const historyYears: HistoryYear[] = data.years
    .map((year) => {
      const previousSubjects = year.subjects.filter(
        (subject) => !matchesActiveContext(year, subject, activeContext)
      )

      return {
        academicYearId: year.academicYearId,
        academicYearName: year.academicYearName,
        academicYearNumber: year.academicYearNumber,
        semesters: groupSubjectsBySemester(previousSubjects),
      }
    })
    .filter((year) => year.semesters.some((semester) => semester.subjects.length > 0))
    .sort((a, b) => a.academicYearNumber - b.academicYearNumber)

  const historySubjectCount = historyYears.reduce(
    (yearTotal, year) =>
      yearTotal + year.semesters.reduce((semesterTotal, semester) => semesterTotal + semester.subjects.length, 0),
    0
  )

  const summaryCards = [
    { label: 'Academic Years', value: data.years.length, icon: GraduationCap },
    { label: 'All Subjects', value: data.totalSubjects, icon: BookOpen },
    { label: 'Current Subjects', value: currentSubjects.length, icon: Layers3 },
    { label: 'Average Score', value: formatPercentage(data.averageScore), icon: BarChart3 },
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700">Progress Center</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Current Studies & Academic History</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Your active enrollment controls the current subject set. Previous year and semester subjects stay preserved as academic history.
            </p>
            <p className="mt-3 text-sm font-medium text-slate-700">Student: {data.studentName}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 rounded-3xl bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Department</p>
              <p className="mt-1 font-semibold text-slate-900">{activeContext?.departmentName ?? data.departmentName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Program</p>
              <p className="mt-1 font-semibold text-slate-900">{activeContext?.programName ?? data.course ?? 'Not set'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-sm">
        <div className="border-b border-emerald-100 bg-emerald-50 px-6 py-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Current Studies</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">
                {activeContext
                  ? `${activeContext.programYearName} · ${activeContext.semesterName}`
                  : 'No active enrollment'}
              </h2>
              {activeContext && (
                <p className="mt-2 text-sm text-slate-600">
                  {activeContext.departmentName} → {activeContext.academicSessionName} → {activeContext.programName} →{' '}
                  {activeContext.programYearName} → {activeContext.semesterName} → {activeContext.groupName} →{' '}
                  {activeContext.languageName}
                </p>
              )}
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
              <span className="font-semibold text-emerald-700">{currentSubjects.length}</span>{' '}
              active subject{currentSubjects.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        <div className="p-6">
          {!activeContext ? (
            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-800">
              No active enrollment was found. Current subjects cannot be resolved until the academic team activates an enrollment.
            </div>
          ) : currentSubjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-800">
              The active enrollment is configured, but no subjects are currently synchronized for this year, semester, group, and language context.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {currentSubjects.map((subject) => (
                <SubjectCard key={subject.scopeId} subject={subject} current />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-violet-700">
              <History className="h-5 w-5" />
              <p className="text-xs font-semibold uppercase tracking-[0.2em]">Academic History</p>
            </div>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">Previous Years & Semesters</h2>
            <p className="mt-1 text-sm text-slate-500">
              Previous subjects remain organized by academic year and semester after promotion.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {historySubjectCount} previous subject{historySubjectCount === 1 ? '' : 's'}
          </div>
        </div>

        <div className="space-y-6">
          {historyYears.map((year) => (
            <article key={year.academicYearId} className="overflow-hidden rounded-3xl border border-slate-200">
              <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{year.academicYearName}</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {year.semesters.length} semester{year.semesters.length === 1 ? '' : 's'} in history
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                  {year.semesters.reduce((sum, semester) => sum + semester.subjects.length, 0)} subjects
                </span>
              </div>

              <div className="space-y-5 p-5">
                {year.semesters.map((semester) => (
                  <section key={`${year.academicYearId}:${semester.name}`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-violet-600" />
                        <h4 className="font-semibold text-slate-900">{semester.name}</h4>
                      </div>
                      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">
                        {semester.subjects.length} subject{semester.subjects.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                      {semester.subjects.map((subject) => (
                        <SubjectCard key={subject.scopeId} subject={subject} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </article>
          ))}

          {historyYears.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
              No previous semester history yet. Completed terms will appear here after promotion.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
