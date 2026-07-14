'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type AiReview = {
  id: string
  versionNumber: number
  status: string
  providerName: string | null
  modelName: string | null
  promptVersion: string | null
  validationPassed: boolean
  documentFormat: string | null
  extractedWordCount: number
  complianceScore: number | null
  similarityScore: number | null
  grammarScore: number | null
  citationScore: number | null
  writingRiskLevel: string
  summary: string | null
  processingTimeMs: number | null
  createdAt: string | null
  released: boolean
  teacherDecision: {
    action: string
    createdAt: string | null
    details: unknown
  } | null
  checks: Array<{
    id: string
    checkType: string
    status: string
    score: number | null
    message: string | null
  }>
  findings: Array<{
    id: string
    category: string
    severity: string
    title: string
    description: string | null
  }>
  sourceMatches: Array<{
    id: string
    providerKey: string
    sourceTitle: string
    similarityPercent: number
    sourceType: string
    teacherEvidence: string | null
  }>
  rubricSuggestions: Array<{
    id: string
    criterionId: string
    suggestedScore: number
    confidence: number
    reason: string
    evidenceText: string | null
  }>
  citationFindings: Array<{
    id: string
    citationStyle: string | null
    issueType: string
    description: string
    referenceText: string | null
    locationLabel: string | null
  }>
  grammarFindings: Array<{
    id: string
    issueType: string
    severity: string
    sentenceText: string | null
    suggestion: string | null
    explanation: string | null
  }>
  recommendations: Array<{
    id: string
    code: string
    confidence: number
    rationale: string
    teacherOnly: boolean
  }>
  audits: Array<{
    id: string
    action: string
    createdAt: string | null
  }>
}

type AttemptRow = {
  id: string
  publicationId: string
  title: string
  attemptNumber: number
  status: string
  submissionType: string
  isLate: boolean
  latePenaltyApplied: number | null
  studentName: string
  studentEmail: string
  submittedAt: string | null
  teacherLocked: boolean
  attachments: Array<{
    id: string
    fileName: string
    downloadUrl: string
    fileSizeBytes: number
    mimeType: string
    malwareStatus: string
  }>
  aiReviews: AiReview[]
  latestGrade: {
    id: string
    status: string
    totalScore: number
    percentage: number
  } | null
}

type Props = {
  attempts: AttemptRow[]
}

function metricValue(value: number | null | undefined, suffix = '') {
  return value == null ? 'n/a' : `${value.toFixed(0)}${suffix}`
}

function decisionLabel(action: string | null | undefined) {
  if (!action) return 'No teacher decision'
  return action.replace(/^TEACHER_/, '').replaceAll('_', ' ')
}

export default function TeacherCourseworkSubmissionInbox({ attempts }: Props) {
  const router = useRouter()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runReviewAction(reviewId: string, action: 'RELEASE' | 'APPROVE' | 'RETURN' | 'REJECT' | 'MANUAL_REVIEW') {
    setBusyKey(`${reviewId}:${action}`)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch(`/api/teacher/coursework/ai-reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update AI review')
      }
      setMessage(`AI review action applied: ${action.replaceAll('_', ' ').toLowerCase()}.`)
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to update AI review')
    } finally {
      setBusyKey(null)
    }
  }

  async function rerunAiReview(attemptId: string) {
    setBusyKey(`${attemptId}:rerun`)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch(`/api/teacher/coursework/attempts/${attemptId}/ai-review`, {
        method: 'POST',
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to re-run AI review')
      }
      setMessage(`AI review re-run created version ${data.versionNumber}.`)
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to re-run AI review')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="space-y-6">
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      {attempts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-16 text-center text-sm text-slate-500">
          No enterprise coursework attempts yet.
        </div>
      ) : null}

      {attempts.map((attempt) => {
        const latestReview = attempt.aiReviews[0] ?? null

        return (
          <section key={attempt.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{attempt.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {attempt.studentName} | {attempt.studentEmail}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Attempt {attempt.attemptNumber} | {attempt.submissionType.replaceAll('_', ' ')} | Submitted {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : 'draft'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{attempt.status}</span>
                {attempt.isLate ? <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-700">Late</span> : null}
                {attempt.teacherLocked ? <span className="rounded-full bg-rose-100 px-2.5 py-1 font-semibold text-rose-700">Locked</span> : null}
                {latestReview ? (
                  <span className="rounded-full bg-sky-100 px-2.5 py-1 font-semibold text-sky-700">
                    AI v{latestReview.versionNumber} {latestReview.status}
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">AI pending</span>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Penalty</p>
                <p className="mt-2">{attempt.latePenaltyApplied ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Attachments</p>
                <p className="mt-2">{attempt.attachments.length}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Grade</p>
                <p className="mt-2">{attempt.latestGrade ? `${attempt.latestGrade.totalScore} (${attempt.latestGrade.status})` : 'Not graded'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">Teacher AI Decision</p>
                <p className="mt-2">{decisionLabel(latestReview?.teacherDecision?.action)}</p>
              </div>
            </div>

            {attempt.attachments.length > 0 ? (
              <div className="mt-4 space-y-3">
                {attempt.attachments.map((attachment) => (
                  <div key={attachment.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{attachment.fileName}</p>
                        <p className="text-xs text-slate-500">{attachment.mimeType} | {attachment.fileSizeBytes} bytes | scan: {attachment.malwareStatus}</p>
                      </div>
                      <a href={attachment.downloadUrl} className="text-sm font-medium text-sky-600 hover:text-sky-700">
                        Open attachment
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void rerunAiReview(attempt.id)}
                disabled={busyKey === `${attempt.id}:rerun`}
                className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                {busyKey === `${attempt.id}:rerun` ? 'Re-running...' : 'Re-run AI'}
              </button>
              {latestReview ? (
                <>
                  <a
                    href={`/api/teacher/coursework/ai-reviews/${latestReview.id}/report?format=json`}
                    className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    JSON report
                  </a>
                  <a
                    href={`/api/teacher/coursework/ai-reviews/${latestReview.id}/report?format=csv`}
                    className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    CSV report
                  </a>
                  <a
                    href={`/api/teacher/coursework/ai-reviews/${latestReview.id}/report?format=pdf`}
                    className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    PDF report
                  </a>
                </>
              ) : null}
            </div>

            {latestReview ? (
              <div className="mt-6 space-y-4 rounded-3xl border border-sky-100 bg-sky-50/60 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">AI Review v{latestReview.versionNumber}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {latestReview.summary || 'AI analysis completed. Teacher decision is still required.'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {latestReview.providerName || 'LOCAL'} | {latestReview.modelName || 'n/a'} | {latestReview.promptVersion || 'n/a'} | {latestReview.processingTimeMs ?? 0} ms
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700">Words {latestReview.extractedWordCount}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700">Similarity {metricValue(latestReview.similarityScore, '%')}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700">Grammar {metricValue(latestReview.grammarScore, '%')}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700">Citation {metricValue(latestReview.citationScore, '%')}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700">Risk {latestReview.writingRiskLevel}</span>
                    <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-700">
                      {latestReview.released ? 'Released to student' : 'Teacher-only'}
                    </span>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-5">
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Compliance</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{metricValue(latestReview.complianceScore, '%')}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Similarity</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{metricValue(latestReview.similarityScore, '%')}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Grammar</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{metricValue(latestReview.grammarScore, '%')}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Citation</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{metricValue(latestReview.citationScore, '%')}</p>
                  </div>
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Recommendation</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{latestReview.recommendations[0]?.code || 'n/a'}</p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Similarity Report</p>
                    {latestReview.sourceMatches.length === 0 ? <p className="mt-2 text-slate-500">No significant internal matches detected.</p> : null}
                    <div className="mt-3 space-y-3">
                      {latestReview.sourceMatches.map((match) => (
                        <div key={match.id} className="rounded-2xl border border-slate-200 p-3">
                          <p className="font-medium text-slate-900">{match.sourceTitle}</p>
                          <p className="mt-1 text-xs text-slate-500">{match.sourceType} | {match.providerKey}</p>
                          <p className="mt-2 text-sm text-slate-700">{match.similarityPercent.toFixed(1)}% similarity</p>
                          {match.teacherEvidence ? <p className="mt-1 text-xs text-slate-500">{match.teacherEvidence}</p> : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Grammar and Citation Findings</p>
                    <div className="mt-3 space-y-3">
                      {latestReview.grammarFindings.slice(0, 5).map((finding) => (
                        <div key={finding.id} className="rounded-2xl border border-slate-200 p-3">
                          <p className="font-medium text-slate-900">{finding.issueType} | {finding.severity}</p>
                          {finding.explanation ? <p className="mt-1 text-slate-700">{finding.explanation}</p> : null}
                          {finding.suggestion ? <p className="mt-1 text-xs text-slate-500">Suggestion: {finding.suggestion}</p> : null}
                        </div>
                      ))}
                      {latestReview.citationFindings.slice(0, 5).map((finding) => (
                        <div key={finding.id} className="rounded-2xl border border-slate-200 p-3">
                          <p className="font-medium text-slate-900">{finding.issueType}</p>
                          <p className="mt-1 text-slate-700">{finding.description}</p>
                          {finding.referenceText ? <p className="mt-1 text-xs text-slate-500">{finding.referenceText}</p> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {latestReview.rubricSuggestions.length > 0 ? (
                  <div className="rounded-2xl bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Rubric Suggestions</p>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {latestReview.rubricSuggestions.map((suggestion) => (
                        <div key={suggestion.id} className="rounded-2xl border border-slate-200 p-3">
                          <p className="font-medium text-slate-900">Criterion {suggestion.criterionId.slice(0, 8)}</p>
                          <p className="mt-1">Suggested score {suggestion.suggestedScore.toFixed(1)} | Confidence {(suggestion.confidence * 100).toFixed(0)}%</p>
                          <p className="mt-1 text-xs text-slate-500">{suggestion.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl bg-white p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Teacher Actions</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button type="button" onClick={() => void runReviewAction(latestReview.id, 'APPROVE')} disabled={busyKey === `${latestReview.id}:APPROVE`} className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      Approve
                    </button>
                    <button type="button" onClick={() => void runReviewAction(latestReview.id, 'RETURN')} disabled={busyKey === `${latestReview.id}:RETURN`} className="rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      Return
                    </button>
                    <button type="button" onClick={() => void runReviewAction(latestReview.id, 'REJECT')} disabled={busyKey === `${latestReview.id}:REJECT`} className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      Reject
                    </button>
                    <button type="button" onClick={() => void runReviewAction(latestReview.id, 'MANUAL_REVIEW')} disabled={busyKey === `${latestReview.id}:MANUAL_REVIEW`} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                      Manual Review
                    </button>
                    <button type="button" onClick={() => void runReviewAction(latestReview.id, 'RELEASE')} disabled={busyKey === `${latestReview.id}:RELEASE`} className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">
                      Release to student
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
