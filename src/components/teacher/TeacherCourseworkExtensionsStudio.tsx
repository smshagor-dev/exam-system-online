'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type ExtensionRow = {
  id: string
  publicationId: string
  status: string
  requestedUntil: string | null
  approvedUntil: string | null
  reason: string | null
  teacherNote: string | null
  decidedAt: string | null
  cancelledAt: string | null
  createdAt: string | null
  studentName: string
  studentEmail: string
  title: string
  subjectName: string
  groupName: string
}

type Props = {
  requests: ExtensionRow[]
}

export default function TeacherCourseworkExtensionsStudio({ requests }: Props) {
  const router = useRouter()
  const [deadlines, setDeadlines] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function updateRequest(request: ExtensionRow, status: 'APPROVED' | 'REJECTED') {
    setSavingId(request.id)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch(`/api/teacher/coursework/publications/${request.publicationId}/extensions/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          approvedUntil: status === 'APPROVED' ? deadlines[request.id] || request.approvedUntil : null,
          teacherNote: notes[request.id] || request.teacherNote || '',
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update extension request')
      }
      setMessage(`Extension request ${status.toLowerCase()}.`)
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to update extension request')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {requests.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-16 text-center text-sm text-slate-500">
          No enterprise extension requests yet.
        </div>
      ) : null}
      {requests.map((request) => (
        <section key={request.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{request.title}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {request.studentName} | {request.studentEmail}
              </p>
              <p className="mt-1 text-xs text-slate-400">{request.subjectName} | {request.groupName}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{request.status}</span>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr),360px]">
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Student reason</p>
              <p className="mt-2 whitespace-pre-wrap">{request.reason || 'No reason provided.'}</p>
              <p className="mt-3 text-xs text-slate-500">
                Requested until: {request.requestedUntil ? new Date(request.requestedUntil).toLocaleString() : 'n/a'}
              </p>
            </div>
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Approved deadline
                <input type="datetime-local" value={deadlines[request.id] ?? ''} onChange={(event) => setDeadlines((current) => ({ ...current, [request.id]: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Teacher note
                <textarea value={notes[request.id] ?? request.teacherNote ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))} rows={4} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
              </label>
              <div className="flex gap-3">
                <button type="button" onClick={() => void updateRequest(request, 'APPROVED')} disabled={savingId === request.id} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">Approve</button>
                <button type="button" onClick={() => void updateRequest(request, 'REJECTED')} disabled={savingId === request.id} className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">Reject</button>
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
