'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, RotateCcw, Settings2, UserPlus, X } from 'lucide-react'

type RequestRow = {
  id: string
  studentId: string
  studentName: string
  studentEmail: string
  originalExamId: string
  originalExamTitle: string
  reExamId: string | null
  reExamTitle: string | null
  reExamStatus: string | null
  reason: string
  type: 'RETAKE' | 'SUPPLEMENTARY' | 'IMPROVEMENT' | 'BACKLOG'
  source: 'STUDENT_REQUEST' | 'TEACHER_MANUAL'
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'
  teacherResponse: string | null
  requestedAt: string
}

type ManualOption = {
  examId: string
  examTitle: string
  subjectName: string
  groupName: string
  students: Array<{
    id: string
    name: string
    email: string
  }>
}

type Props = {
  requests: RequestRow[]
  manualOptions: ManualOption[]
}

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

export default function ReExamManagementClient({ requests, manualOptions }: Props) {
  const router = useRouter()
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [manualExamId, setManualExamId] = useState(manualOptions[0]?.examId ?? '')
  const selectedManualExam = useMemo(
    () => manualOptions.find((exam) => exam.examId === manualExamId) ?? manualOptions[0] ?? null,
    [manualExamId, manualOptions]
  )
  const [manualStudentId, setManualStudentId] = useState(selectedManualExam?.students[0]?.id ?? '')
  const [manualReason, setManualReason] = useState('Enabled manually by teacher')
  const [manualType, setManualType] = useState<'RETAKE' | 'SUPPLEMENTARY' | 'IMPROVEMENT' | 'BACKLOG'>('RETAKE')
  const [manualWorking, setManualWorking] = useState(false)

  function changeManualExam(examId: string) {
    setManualExamId(examId)
    const option = manualOptions.find((exam) => exam.examId === examId)
    setManualStudentId(option?.students[0]?.id ?? '')
  }

  async function review(requestId: string, action: 'APPROVE' | 'REJECT') {
    setWorkingId(requestId)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch(`/api/teacher/re-exams/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          teacherResponse: responses[requestId]?.trim() || null,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not update request')
      }
      setMessage(action === 'APPROVE' ? 'Request approved and a new re-exam draft was created.' : 'Request rejected.')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not update request')
    } finally {
      setWorkingId(null)
    }
  }

  async function enableManually() {
    if (!manualExamId || !manualStudentId) return
    setManualWorking(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch('/api/teacher/re-exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalExamId: manualExamId,
          studentId: manualStudentId,
          reason: manualReason,
          type: manualType,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not enable re-exam')
      }
      setMessage('Re-exam enabled. A separate draft exam is ready for setup.')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not enable re-exam')
    } finally {
      setManualWorking(false)
    }
  }

  const pending = requests.filter((request) => request.status === 'PENDING')
  const history = requests.filter((request) => request.status !== 'PENDING')

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
              <RotateCcw className="h-3.5 w-3.5" />
              Re-exam Management
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">Requests & Manual Enable</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Approve student requests or enable a re-exam directly for a selected student. Approval creates a separate draft exam, so the original attempt and result stay untouched.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center text-sm">
            <div className="rounded-2xl border border-amber-100 bg-white px-4 py-3">
              <p className="text-2xl font-bold text-amber-600">{pending.length}</p>
              <p className="text-xs text-slate-500">Pending</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3">
              <p className="text-2xl font-bold text-emerald-600">{requests.filter((request) => request.status === 'APPROVED').length}</p>
              <p className="text-xs text-slate-500">Approved</p>
            </div>
          </div>
        </div>
      </section>

      {(error || message) && (
        <div className={`rounded-2xl px-4 py-3 text-sm ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {error ?? message}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-sky-600" />
          <h2 className="text-lg font-semibold text-slate-900">Enable re-exam manually</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">No student request is required for this action.</p>

        {manualOptions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No completed exam with enrolled students is available.
          </div>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Original exam</span>
              <select
                value={manualExamId}
                onChange={(event) => changeManualExam(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                {manualOptions.map((exam) => (
                  <option key={exam.examId} value={exam.examId}>
                    {exam.subjectName} — {exam.examTitle} ({exam.groupName})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Student</span>
              <select
                value={manualStudentId}
                onChange={(event) => setManualStudentId(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                {(selectedManualExam?.students ?? []).map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name} — {student.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Type</span>
              <select
                value={manualType}
                onChange={(event) => setManualType(event.target.value as typeof manualType)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                <option value="RETAKE">Retake / Re-exam</option>
                <option value="SUPPLEMENTARY">Supplementary</option>
                <option value="IMPROVEMENT">Improvement</option>
                <option value="BACKLOG">Backlog</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Teacher note / reason</span>
              <input
                value={manualReason}
                onChange={(event) => setManualReason(event.target.value)}
                maxLength={1500}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <div className="lg:col-span-2">
              <button
                type="button"
                onClick={enableManually}
                disabled={manualWorking || !manualStudentId}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UserPlus className="h-4 w-4" />
                {manualWorking ? 'Enabling...' : 'Enable re-exam for student'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Pending student requests</h2>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">{pending.length}</span>
        </div>

        {pending.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">No pending re-exam request.</div>
        ) : (
          <div className="mt-4 space-y-4">
            {pending.map((request) => (
              <article key={request.id} className="rounded-2xl border border-amber-200 bg-amber-50/30 p-4 sm:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900">{request.studentName}</h3>
                    <p className="text-xs text-slate-500">{request.studentEmail}</p>
                    <p className="mt-2 text-sm font-medium text-slate-700">{request.originalExamTitle}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-sky-700">{request.type.replaceAll('_', ' ')}</p>
                  </div>
                  <span className="w-fit rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">PENDING</span>
                </div>

                <div className="mt-4 rounded-xl bg-white p-3 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Student reason</p>
                  <p className="mt-1 whitespace-pre-wrap">{request.reason}</p>
                </div>

                <textarea
                  value={responses[request.id] ?? ''}
                  onChange={(event) => setResponses((current) => ({ ...current, [request.id]: event.target.value }))}
                  rows={2}
                  maxLength={1500}
                  placeholder="Optional teacher response..."
                  className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => review(request.id, 'APPROVE')}
                    disabled={workingId === request.id}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    Accept & create draft
                  </button>
                  <button
                    type="button"
                    onClick={() => review(request.id, 'REJECT')}
                    disabled={workingId === request.id}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-400">Requested: {formatDate(request.requestedAt)}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">Decision history</h2>
        {history.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">No reviewed request yet.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {history.map((request) => (
              <article key={request.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{request.studentName}</p>
                    <p className="text-sm text-slate-600">{request.originalExamTitle}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {request.type.replaceAll('_', ' ')} · {request.source === 'TEACHER_MANUAL' ? 'Manual enable' : 'Student request'}
                    </p>
                  </div>
                  <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[request.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {request.status}
                  </span>
                </div>
                {request.teacherResponse && <p className="mt-3 text-sm text-slate-600">Response: {request.teacherResponse}</p>}
                {request.status === 'APPROVED' && request.reExamId && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-emerald-700">{request.reExamTitle ?? 'Re-exam'} · {request.reExamStatus ?? 'DRAFT'}</span>
                    <Link
                      href={`/teacher/re-exams/${request.id}/setup`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      Setup exam
                    </Link>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
