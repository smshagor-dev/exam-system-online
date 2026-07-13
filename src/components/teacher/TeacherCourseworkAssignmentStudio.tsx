'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type TemplateOption = {
  id: string
  title: string
  subjectId: string
  subjectName: string
  languageId: string
  languageName: string
  groupId: string | null
  groupName: string | null
  academicYearId: string | null
  academicYearName: string | null
  semesterId: string | null
  semesterName: string | null
  academicOfferingId: string | null
}

type PublicationRow = {
  id: string
  title: string
  status: string
  dueAt: string | null
  hardCloseAt: string | null
  scheduledFor: string | null
  publishedAt: string | null
  closedAt: string | null
  targetCount: number
  attemptCount: number
  gradeCount: number
  subjectName: string
  languageName: string
  groupName: string
}

type Props = {
  templates: TemplateOption[]
  publications: PublicationRow[]
}

export default function TeacherCourseworkAssignmentStudio({ templates, publications }: Props) {
  const router = useRouter()
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('DRAFT')
  const [dueAt, setDueAt] = useState('')
  const [hardCloseAt, setHardCloseAt] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function createAssignment() {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch('/api/teacher/coursework/publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          title,
          status,
          dueAt: dueAt || null,
          hardCloseAt: hardCloseAt || null,
          scheduledFor: scheduledFor || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create coursework assignment')
      }
      setMessage('Coursework assignment created.')
      setTitle('')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to create coursework assignment')
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(publicationId: string, nextStatus: string) {
    setMessage(null)
    setError(null)
    try {
      const response = await fetch(`/api/teacher/coursework/publications/${publicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update coursework assignment')
      }
      setMessage(`Publication moved to ${nextStatus}.`)
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to update coursework assignment')
    }
  }

  return (
    <div className="space-y-6">
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Create Assignment Publication</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">
            Template
            <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title} | {template.subjectName} | {template.groupName ?? 'No group'}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">
              <option value="DRAFT">Draft</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Due Date
            <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Hard Close
            <input type="datetime-local" value={hardCloseAt} onChange={(event) => setHardCloseAt(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          </label>
          <label className="text-sm font-medium text-slate-700 xl:col-span-2">
            Assignment Title Override
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="Leave blank to reuse template title" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Scheduled For
            <input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
          </label>
        </div>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={() => void createAssignment()} disabled={saving || !templateId} className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60">
            {saving ? 'Creating...' : 'Create Assignment'}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Assignment Lifecycle</h2>
        <div className="mt-4 space-y-4">
          {publications.length === 0 ? <p className="text-sm text-slate-500">No enterprise assignments published yet.</p> : null}
          {publications.map((publication) => (
            <div key={publication.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{publication.title}</h3>
                  <p className="text-sm text-slate-500">
                    {publication.subjectName} | {publication.languageName} | {publication.groupName}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Due: {publication.dueAt ? new Date(publication.dueAt).toLocaleString() : 'none'} | Hard close: {publication.hardCloseAt ? new Date(publication.hardCloseAt).toLocaleString() : 'none'}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{publication.status}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">Targets: {publication.targetCount}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">Attempts: {publication.attemptCount}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">Grades: {publication.gradeCount}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {['DRAFT', 'SCHEDULED', 'PUBLISHED', 'CLOSED', 'ARCHIVED'].map((nextStatus) => (
                  <button key={nextStatus} type="button" onClick={() => void updateStatus(publication.id, nextStatus)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100">
                    Move to {nextStatus.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
