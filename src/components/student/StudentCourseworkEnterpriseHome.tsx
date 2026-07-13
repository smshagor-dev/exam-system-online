'use client'

import Link from 'next/link'

type PublicationCard = {
  id: string
  title: string
  description: string | null
  status: string
  dueAt: string | null
  hardCloseAt: string | null
  subjectName: string
  languageName: string
  groupName: string
  academicYearName: string
  semesterName: string
  attempts: Array<{
    id: string
    attemptNumber: number
    status: string
    isLate: boolean
    latestGrade: {
      id: string
      status: string
      totalScore: number
      percentage: number
      textFeedback: string | null
      criterionScores: Array<{
        criterionId: string
        selectedLevelId: string | null
        score: number
        feedback: string | null
      }>
    } | null
  }>
  extensionRequests: Array<{
    id: string
    status: string
    approvedUntil: string | null
  }>
}

type Props = {
  publications: PublicationCard[]
}

export default function StudentCourseworkEnterpriseHome({ publications }: Props) {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Enterprise Coursework</h1>
        <p className="mt-1 text-sm text-slate-500">
          View eligible coursework, submit attempts, request extensions, and review grades and rubric feedback.
        </p>
      </section>

      {publications.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-16 text-center text-sm text-slate-500">
          No enterprise coursework is available for you yet.
        </div>
      ) : null}

      {publications.map((publication) => {
        const latestAttempt = publication.attempts[0] ?? null
        const latestExtension = publication.extensionRequests[0] ?? null

        return (
          <section key={publication.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{publication.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {publication.subjectName} | {publication.languageName} | {publication.groupName}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {publication.academicYearName} | {publication.semesterName} | Due {publication.dueAt ? new Date(publication.dueAt).toLocaleString() : 'not set'}
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{publication.status}</span>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-700">{publication.description || 'No description provided.'}</p>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Attempts</p>
                <p className="mt-2">{publication.attempts.length}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Latest attempt</p>
                <p className="mt-2">{latestAttempt ? `#${latestAttempt.attemptNumber} · ${latestAttempt.status}` : 'No attempt yet'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Extension</p>
                <p className="mt-2">{latestExtension ? latestExtension.status : 'No request'}</p>
              </div>
            </div>

            {latestAttempt?.latestGrade ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                Grade published: {latestAttempt.latestGrade.totalScore} ({latestAttempt.latestGrade.percentage.toFixed(2)}%)
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/student/coursework/${publication.id}`} className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white">
                View Details
              </Link>
              <Link href={`/student/coursework/${publication.id}/submit`} className="rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white">
                Submit Attempt
              </Link>
              <Link href={`/student/coursework/${publication.id}/history`} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
                Attempt History
              </Link>
            </div>
          </section>
        )
      })}
    </div>
  )
}
