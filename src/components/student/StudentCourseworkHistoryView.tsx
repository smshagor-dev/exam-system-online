'use client'

type ReleasedAiReview = {
  id: string
  versionNumber: number
  status: string
  validationPassed: boolean
  extractedWordCount: number
  complianceScore: number | null
  grammarScore: number | null
  citationScore: number | null
  writingRiskLevel: string
  summary: string | null
  createdAt: string | null
  findings: Array<{
    id: string
    category: string
    severity: string
    title: string
    description: string | null
  }>
  grammarFindings: Array<{
    id: string
    issueType: string
    severity: string
    suggestion: string | null
    explanation: string | null
  }>
  citationFindings: Array<{
    id: string
    issueType: string
    description: string
  }>
  recommendations: Array<{
    id: string
    code: string
    confidence: number
    rationale: string
  }>
}

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
  releasedAiReviews: ReleasedAiReview[]
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

function metric(value: number | null | undefined) {
  return value == null ? 'n/a' : `${value.toFixed(0)}%`
}

export default function StudentCourseworkHistoryView({ title, attempts }: Props) {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Attempt history, released AI review feedback, attachments, and latest grade visibility.</p>
      </section>

      {attempts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-16 text-center text-sm text-slate-500">
          No attempts yet for this coursework.
        </div>
      ) : null}

      {attempts.map((attempt) => {
        const latestReleasedReview = attempt.releasedAiReviews[0] ?? null

        return (
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
                {latestReleasedReview ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-700">AI review released</span> : null}
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

            {latestReleasedReview ? (
              <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Released AI Review v{latestReleasedReview.versionNumber}</p>
                <p className="mt-2">{latestReleasedReview.summary || 'AI feedback has been released by your teacher.'}</p>
                <div className="mt-3 grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Compliance</p>
                    <p className="mt-2 font-semibold text-slate-900">{metric(latestReleasedReview.complianceScore)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Grammar</p>
                    <p className="mt-2 font-semibold text-slate-900">{metric(latestReleasedReview.grammarScore)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Citation</p>
                    <p className="mt-2 font-semibold text-slate-900">{metric(latestReleasedReview.citationScore)}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Writing risk</p>
                    <p className="mt-2 font-semibold text-slate-900">{latestReleasedReview.writingRiskLevel}</p>
                  </div>
                </div>
                {latestReleasedReview.grammarFindings.length > 0 ? (
                  <div className="mt-4">
                    <p className="font-semibold text-slate-900">Grammar suggestions</p>
                    <div className="mt-2 space-y-2">
                      {latestReleasedReview.grammarFindings.slice(0, 4).map((finding) => (
                        <div key={finding.id} className="rounded-2xl bg-white p-3">
                          <p className="font-medium text-slate-900">{finding.issueType}</p>
                          {finding.explanation ? <p className="mt-1">{finding.explanation}</p> : null}
                          {finding.suggestion ? <p className="mt-1 text-xs text-slate-500">Suggestion: {finding.suggestion}</p> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {latestReleasedReview.citationFindings.length > 0 ? (
                  <div className="mt-4">
                    <p className="font-semibold text-slate-900">Citation findings</p>
                    <div className="mt-2 space-y-2">
                      {latestReleasedReview.citationFindings.slice(0, 4).map((finding) => (
                        <div key={finding.id} className="rounded-2xl bg-white p-3">
                          <p className="font-medium text-slate-900">{finding.issueType}</p>
                          <p className="mt-1">{finding.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {attempt.latestGrade ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                <p className="font-semibold">Grade: {attempt.latestGrade.totalScore} ({attempt.latestGrade.percentage.toFixed(2)}%)</p>
                {attempt.latestGrade.textFeedback ? <p className="mt-2">{attempt.latestGrade.textFeedback}</p> : null}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
