'use client'

type AttemptRecord = {
  id: string
  attemptNumber: number
  status: string
  submissionType: string
  isLate: boolean
  latePenaltyApplied: number | null
  submittedAt: string | null
  attachments: Array<{
    id: string
    fileName: string
    downloadUrl: string
    fileSizeBytes: number
    mimeType: string
    malwareStatus: string
  }>
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
}

type Props = {
  title: string
  attempts: AttemptRecord[]
}

export default function StudentCourseworkHistoryView({ title, attempts }: Props) {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Attempt history, attachments, and latest grade visibility.</p>
      </section>

      {attempts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-16 text-center text-sm text-slate-500">
          No attempts yet for this coursework.
        </div>
      ) : null}

      {attempts.map((attempt) => (
        <section key={attempt.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Attempt #{attempt.attemptNumber}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {attempt.submissionType.replaceAll('_', ' ')} | {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : 'Not submitted'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{attempt.status}</span>
              {attempt.isLate ? <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-700">Late</span> : null}
            </div>
          </div>
          {attempt.attachments.length > 0 ? (
            <div className="mt-4 space-y-3">
              {attempt.attachments.map((attachment) => (
                <a key={attachment.id} href={attachment.downloadUrl} className="block rounded-2xl border border-slate-200 p-4 text-sm text-slate-700 hover:bg-slate-50">
                  {attachment.fileName} | {attachment.fileSizeBytes} bytes | {attachment.malwareStatus}
                </a>
              ))}
            </div>
          ) : null}
          {attempt.latestGrade ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              <p className="font-semibold">Grade: {attempt.latestGrade.totalScore} ({attempt.latestGrade.percentage.toFixed(2)}%)</p>
              {attempt.latestGrade.textFeedback ? <p className="mt-2">{attempt.latestGrade.textFeedback}</p> : null}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  )
}
