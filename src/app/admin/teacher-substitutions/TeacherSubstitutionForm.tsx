'use client'

import { TeacherSubstitutionStatus } from '@prisma/client/index'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Option = {
  id: string
  label: string
}

type Props = {
  assignments: Array<Option & { originalTeacherId: string }>
  teachers: Option[]
}

type TeacherSubstitutionFormState = {
  teachingAssignmentId: string
  originalTeacherId: string
  substituteTeacherId: string
  startsAt: string
  endsAt: string
  reason: string
  status: TeacherSubstitutionStatus
}

export default function TeacherSubstitutionForm({ assignments, teachers }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<TeacherSubstitutionFormState>({
    teachingAssignmentId: assignments[0]?.id ?? '',
    originalTeacherId: assignments[0]?.originalTeacherId ?? '',
    substituteTeacherId: teachers[0]?.id ?? '',
    startsAt: '',
    endsAt: '',
    reason: '',
    status: TeacherSubstitutionStatus.PENDING,
  })

  function onAssignmentChange(assignmentId: string) {
    const assignment = assignments.find((item) => item.id === assignmentId)
    setForm((current) => ({
      ...current,
      teachingAssignmentId: assignmentId,
      originalTeacherId: assignment?.originalTeacherId ?? '',
    }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/teacher-substitutions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          reason: form.reason || null,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create substitution')
      }
      router.refresh()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to create substitution')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Create Substitution</h2>
      <p className="mt-1 text-sm text-gray-500">Create temporary coverage windows and validate overlap rejection from the admin UI.</p>
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Field label="Assignment">
          <select value={form.teachingAssignmentId} onChange={(event) => onAssignmentChange(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.label}</option>)}
          </select>
        </Field>
        <Field label="Substitute Teacher">
          <select value={form.substituteTeacherId} onChange={(event) => setForm((current) => ({ ...current, substituteTeacherId: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.label}</option>)}
          </select>
        </Field>
        <Field label="Initial Status">
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as TeacherSubstitutionStatus }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {[TeacherSubstitutionStatus.PENDING, TeacherSubstitutionStatus.APPROVED, TeacherSubstitutionStatus.ACTIVE].map((status) => (
              <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Starts At">
          <input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
        </Field>
        <Field label="Ends At">
          <input type="datetime-local" value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Reason">
          <textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className="min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Conference, illness, review support" />
        </Field>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {loading ? 'Saving...' : 'Create Substitution'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  )
}
