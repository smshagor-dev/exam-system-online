'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type AttemptRow = {
  id: string
  publicationId: string
  title: string
  attemptNumber: number
  studentName: string
  studentEmail: string
  latestGrade: {
    id: string
    status: string
    totalScore: number
    percentage: number
  } | null
}

type GradeRow = {
  id: string
  attemptId: string
  publicationId: string
  title: string
  studentName: string
  studentEmail: string
  status: string
  totalScore: number
  percentage: number
  textFeedback: string | null
  privateNotes: string | null
}

type Props = {
  attempts: AttemptRow[]
  grades: GradeRow[]
}

export default function TeacherCourseworkGradingStudio({ attempts, grades }: Props) {
  const router = useRouter()
  const [attemptId, setAttemptId] = useState(attempts[0]?.id ?? '')
  const [status, setStatus] = useState('DRAFT')
  const [totalScore, setTotalScore] = useState('0')
  const [manualAdjustment, setManualAdjustment] = useState('0')
  const [textFeedback, setTextFeedback] = useState('')
  const [privateNotes, setPrivateNotes] = useState('')
  const [moderationDecisionStatus, setModerationDecisionStatus] = useState('')
  const [moderationNotes, setModerationNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedAttempt = attempts.find((attempt) => attempt.id === attemptId) ?? attempts[0]

  async function saveGrade() {
    if (!selectedAttempt) {
      setError('Select an attempt to grade.')
      return
    }

    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch(`/api/teacher/coursework/publications/${selectedAttempt.publicationId}/grades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId: selectedAttempt.id,
          status,
          manualAdjustment: Number(manualAdjustment) || 0,
          textFeedback,
          privateNotes,
          criterionScores: [
            {
              criterionId: 'manual-total',
              awardedScore: Number(totalScore) || 0,
              feedback: textFeedback,
            },
          ],
          moderationDecisionStatus: moderationDecisionStatus || undefined,
          moderationNotes,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save grade')
      }
      setMessage('Grade workflow updated.')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to save grade')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),minmax(340px,0.8fr)]">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Grade Submission</h2>
        {message ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
        {error ? <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Attempt
            <select value={attemptId} onChange={(event) => setAttemptId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">
              {attempts.map((attempt) => (
                <option key={attempt.id} value={attempt.id}>
                  {attempt.title} | {attempt.studentName} | attempt {attempt.attemptNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Grade Status
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="MODERATION">Submitted for moderation</option>
              <option value="APPROVED">Approved</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Score
            <input value={totalScore} onChange={(event) => setTotalScore(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Manual Adjustment
            <input value={manualAdjustment} onChange={(event) => setManualAdjustment(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Moderation Decision
            <select value={moderationDecisionStatus} onChange={(event) => setModerationDecisionStatus(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">
              <option value="">No moderation event</option>
              <option value="PENDING">Pending</option>
              <option value="CHANGES_REQUESTED">Changes requested</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Student-visible feedback
            <textarea value={textFeedback} onChange={(event) => setTextFeedback(event.target.value)} rows={4} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Private notes
            <textarea value={privateNotes} onChange={(event) => setPrivateNotes(event.target.value)} rows={4} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Moderation notes
            <textarea value={moderationNotes} onChange={(event) => setModerationNotes(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          </label>
        </div>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={() => void saveGrade()} disabled={saving || !selectedAttempt} className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving...' : 'Save Grade Workflow'}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Recent Grades</h2>
        <div className="mt-4 space-y-4">
          {grades.length === 0 ? <p className="text-sm text-slate-500">No grades yet.</p> : null}
          {grades.map((grade) => (
            <div key={grade.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{grade.title}</h3>
                  <p className="text-sm text-slate-500">{grade.studentName} | {grade.studentEmail}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{grade.status}</span>
              </div>
              <p className="mt-3 text-sm text-slate-700">Score: {grade.totalScore} | Percentage: {grade.percentage.toFixed(2)}%</p>
              {grade.textFeedback ? <p className="mt-2 text-sm text-slate-600">{grade.textFeedback}</p> : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
