'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Option = {
  id: string
  label: string
}

type Props = {
  teachers: Option[]
  departments: Option[]
}

export default function TeacherDepartmentMembershipForm({ teachers, departments }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    teacherId: teachers[0]?.id ?? '',
    departmentId: departments[0]?.id ?? '',
    role: '',
    isPrimary: false,
    isActive: true,
  })

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/teacher-memberships', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save membership')
      }
      router.refresh()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to save membership')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Create Or Update Membership</h2>
      <p className="mt-1 text-sm text-gray-500">Use this to validate department membership and primary-teacher scope from the admin UI.</p>
      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <Field label="Teacher">
          <select value={form.teacherId} onChange={(event) => setForm((current) => ({ ...current, teacherId: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.label}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <select value={form.departmentId} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {departments.map((department) => <option key={department.id} value={department.id}>{department.label}</option>)}
          </select>
        </Field>
        <Field label="Role">
          <input value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Coordinator, Reviewer" />
        </Field>
        <div className="flex items-end gap-4 pb-2">
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.isPrimary} onChange={(event) => setForm((current) => ({ ...current, isPrimary: event.target.checked }))} />Primary</label>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />Active</label>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {loading ? 'Saving...' : 'Save Membership'}
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
