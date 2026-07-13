'use client'

import { useEffect, useState } from 'react'

type ReportPayload = {
  summary: {
    publicationCount: number
    submittedCount: number
    draftCount: number
    lateCount: number
    gradedCount: number
    publishedGradeCount: number
    extensionRequestCount: number
    extensionApprovedCount: number
    averageGradePercentage: number
    averageGradingTurnaroundHours: number
  }
  publications: Array<{
    id: string
    title: string
    status: string
    counts: {
      attempts: number
      grades: number
      extensionRequests: number
      targets: number
    }
  }>
}

export default function TeacherCourseworkReportsView() {
  const [report, setReport] = useState<ReportPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/teacher/coursework/reports')
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load coursework reports')
        }
        setReport(data)
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : 'Failed to load coursework reports')
      })
  }, [])

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {!report ? <div className="rounded-3xl border border-slate-200 bg-white p-10 text-sm text-slate-500 shadow-sm">Loading coursework reports...</div> : null}
      {report ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              ['Publications', report.summary.publicationCount],
              ['Submitted', report.summary.submittedCount],
              ['Late', report.summary.lateCount],
              ['Grades', report.summary.gradedCount],
              ['Extensions', report.summary.extensionRequestCount],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr),360px]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">Assignment Completion</h2>
                <div className="flex flex-wrap gap-2">
                  <a href="/api/teacher/coursework/reports?format=csv&type=submission" className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Submission CSV</a>
                  <a href="/api/teacher/coursework/reports?format=csv&type=grades" className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Grades CSV</a>
                  <a href="/api/teacher/coursework/reports?format=csv&type=extensions" className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Extensions CSV</a>
                  <a href="/api/teacher/coursework/reports?format=csv&type=missing" className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Missing CSV</a>
                </div>
              </div>
              <div className="mt-4 space-y-4">
                {report.publications.map((publication) => (
                  <div key={publication.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-900">{publication.title}</h3>
                        <p className="text-sm text-slate-500">{publication.status}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {publication.counts.attempts}/{publication.counts.targets} attempted
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-4 text-sm text-slate-600">
                      <div>Attempts: {publication.counts.attempts}</div>
                      <div>Grades: {publication.counts.grades}</div>
                      <div>Extensions: {publication.counts.extensionRequests}</div>
                      <div>Missing: {Math.max(0, publication.counts.targets - publication.counts.attempts)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Analytics Snapshot</h2>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="font-medium text-slate-900">Average grade percentage</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{report.summary.averageGradePercentage.toFixed(2)}%</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="font-medium text-slate-900">Average grading turnaround</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{report.summary.averageGradingTurnaroundHours.toFixed(2)}h</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="font-medium text-slate-900">Published grades</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{report.summary.publishedGradeCount}</p>
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
