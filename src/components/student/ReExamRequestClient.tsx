'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Send, ShieldCheck } from 'lucide-react'

type EligibleExam = {
  id: string
  title: string
  subjectName: string
  endedAt: string
  marksObtained: number | null
  percentage: number | null
  isPassed: boolean | null
  attemptStatus: string | null
}

type RequestRow = {
  id: string
  originalExamId: string
  originalExamTitle: string
  reExamId: string | null
  reExamTitle: string | null
  reason: string
  type: 'RETAKE' | 'SUPPLEMENTARY' | 'IMPROVEMENT' | 'BACKLOG'
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  source: 'STUDENT_REQUEST' | 'TEACHER_MANUAL'
  teacherResponse: string | null
  requestedAt: string
  decidedAt: string | null
  reExamStatus: string | null
  reExamStartTime: string | null
  reExamEndTime: string | null
}

type Props = {
  eligibleExams: EligibleExam[]
  requests: RequestRow[]
  initialExamId?: string
}

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
}

function formatDate(value: string | null) {
  if (!value) return 'Not scheduled yet'
  return new Date(value).toLocaleString()
}

export default function ReExamRequestClient({ eligibleExams, requests, initialExamId }: Props) {
  const router = useRouter()
  const defaultExam = useMemo(
    () => eligibleExams.find((exam) => exam.id === initialExamId)?.id ?? eligibleExams[0]?.id ?? '',
    [eligibleExams, initialExamId]
  )
  const [originalExamId, setOriginalExamId] = useState(defaultExam)
  const [type, setType] = useState<'RETAKE' | 'SUPPLEMENTARY' | 'IMPROVEMENT' | 'BACKLOG'>('RETAKE')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submitRequest() {
    if (!originalExamId) return
    setSubmitting(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch('/api/student/re-exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalExamId, type, reason }),
      })
      const payload = await response.json()
      if (!response.ok) {
        const detail = typeof payload.error === 'string' ? payload.error : 'Could not submit re-exam request'
        throw new Error(detail)
      }
      setReason('')
      setMessage('Request sent to the teacher successfully.')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not submit request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white to-violet-50 p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
              <RotateCcw className="h-3.5 w-3.5" />
              Re-exam Center
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">Request a Re-exam</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Select a completed exam, choose the request type, and explain your reason. Your teacher will review the request before a new exam is created.
            </p>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-sm text-slate-600">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-violet-600" />
              Separate attempt history
            </div>
            <p className="mt-1 text-xs text-slate-500">Your original exam and result remain unchanged.</p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">New request</h2>
        {eligibleExams.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No completed exam is currently available for a new re-exam request.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Original exam</span>
              <select
                value={originalExamId}
                onChange={(event) => setOriginalExamId(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              >
                {eligibleExams.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.subjectName} — {exam.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Request type</span>
              <select
                value={type}
                onChange={(event) => setType(event.target.value as typeof type)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              >
                <option value="RETAKE">Retake / Re-exam</option>
                <option value="SUPPLEMENTARY">Supplementary</option>
                <option value="IMPROVEMENT">Improvement</option>
                <option value="BACKLOG">Backlog</option>
              </select>
            </label>

            <label className="block lg:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Reason</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={4}
                maxLength={1500}
                placeholder="Explain why you need a re-exam (minimum 10 characters)..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              />
              <div className="mt-1 flex justify-between text-xs text-slate-400">
                <span>Minimum 10 characters</span>
                <span>{reason.length}/1500</span>
              </div>
            </label>

            <div className="lg:col-span-2">
              {error && <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
              {message && <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
              <button
                type="button"
                onClick={submitRequest}
                disabled={submitting || reason.trim().length < 10 || !originalExamId}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Sending...' : 'Send request to teacher'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Request history</h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{requests.length}</span>
        </div>

        {requests.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">No re-exam requests yet.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {requests.map((request) => (
              <article key={request.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{request.originalExamTitle}</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-violet-700">
                      {request.type.replaceAll('_', ' ')} · {request.source === 'TEACHER_MANUAL' ? 'Teacher enabled' : 'Student request'}
                    </p>
                  </div>
                  <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[request.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {request.status}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Reason</p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-700">{request.reason}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Teacher response</p>
                    <p className="mt-1 text-slate-700">{request.teacherResponse || 'No response yet'}</p>
                  </div>
                </div>

                {request.status === 'APPROVED' && (
                  <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <p className="font-semibold">{request.reExamTitle || 'Re-exam draft created'}</p>
                    <p className="mt-1 text-xs text-emerald-700">
                      Status: {request.reExamStatus ?? 'DRAFT'} · Start: {formatDate(request.reExamStartTime)}
                    </p>
                  </div>
                )}

                <p className="mt-3 text-xs text-slate-400">Requested: {formatDate(request.requestedAt)}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
