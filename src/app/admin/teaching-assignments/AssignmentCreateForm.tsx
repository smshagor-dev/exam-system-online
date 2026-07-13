'use client'

import { TeachingAssignmentRoleType, TeachingAssignmentStatus } from '@prisma/client/index'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Option = {
  id: string
  label: string
}

type Props = {
  teachers: Option[]
  departments: Option[]
  offerings: Array<Option & { departmentId: string }>
  memberships: Array<Option & { teacherId: string; departmentId: string }>
}

type AssignmentCreateFormState = {
  teacherId: string
  departmentId: string
  academicOfferingId: string
  membershipId: string
  status: TeachingAssignmentStatus
  weeklyHours: string
  lectureHours: string
  labHours: string
  consultationHours: string
  assessmentHours: string
  notes: string
  isPrimary: boolean
  roles: TeachingAssignmentRoleType[]
}

const defaultRoles = [TeachingAssignmentRoleType.LEAD_TEACHER]

export default function AssignmentCreateForm({ teachers, departments, offerings, memberships }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<AssignmentCreateFormState>({
    teacherId: teachers[0]?.id ?? '',
    departmentId: departments[0]?.id ?? '',
    academicOfferingId: '',
    membershipId: '',
    status: TeachingAssignmentStatus.DRAFT,
    weeklyHours: '0',
    lectureHours: '0',
    labHours: '0',
    consultationHours: '0',
    assessmentHours: '0',
    notes: '',
    isPrimary: false,
    roles: defaultRoles,
  })

  const filteredOfferings = offerings.filter((offering) => offering.departmentId === form.departmentId)
  const filteredMemberships = memberships.filter(
    (membership) => membership.teacherId === form.teacherId && membership.departmentId === form.departmentId
  )

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/teaching-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: form.teacherId,
          departmentId: form.departmentId,
          academicOfferingId: form.academicOfferingId,
          membershipId: form.membershipId || null,
          status: form.status,
          weeklyHours: Number(form.weeklyHours),
          lectureHours: Number(form.lectureHours),
          labHours: Number(form.labHours),
          consultationHours: Number(form.consultationHours),
          assessmentHours: Number(form.assessmentHours),
          notes: form.notes || null,
          isPrimary: form.isPrimary,
          roles: form.roles,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create teaching assignment')
      }

      setForm((current) => ({
        ...current,
        academicOfferingId: '',
        membershipId: '',
        weeklyHours: '0',
        lectureHours: '0',
        labHours: '0',
        consultationHours: '0',
        assessmentHours: '0',
        notes: '',
        isPrimary: false,
        roles: [...defaultRoles],
      }))
      router.refresh()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to create teaching assignment')
    } finally {
      setLoading(false)
    }
  }

  function toggleRole(role: TeachingAssignmentRoleType) {
    setForm((current) => {
      const hasRole = current.roles.includes(role)
      const nextRoles = hasRole ? current.roles.filter((item) => item !== role) : [...current.roles, role]
      return {
        ...current,
        roles: nextRoles.length > 0 ? nextRoles : [...defaultRoles],
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Create Teaching Assignment</h2>
      <p className="mt-1 text-sm text-gray-500">Create a draft, submitted, or approved assignment record from the admin UI.</p>

      {error ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Teacher">
          <select value={form.teacherId} onChange={(event) => setForm((current) => ({ ...current, teacherId: event.target.value, membershipId: '' }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.label}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <select value={form.departmentId} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value, academicOfferingId: '', membershipId: '' }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.label}</option>)}
          </select>
        </Field>
        <Field label="Offering">
          <select value={form.academicOfferingId} onChange={(event) => setForm((current) => ({ ...current, academicOfferingId: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
            <option value="">Select offering</option>
            {filteredOfferings.map((offering) => <option key={offering.id} value={offering.id}>{offering.label}</option>)}
          </select>
        </Field>
        <Field label="Membership">
          <select value={form.membershipId} onChange={(event) => setForm((current) => ({ ...current, membershipId: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="">Auto-select active membership</option>
            {filteredMemberships.map((membership) => <option key={membership.id} value={membership.id}>{membership.label}</option>)}
          </select>
        </Field>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <NumberField label="Weekly" value={form.weeklyHours} onChange={(value) => setForm((current) => ({ ...current, weeklyHours: value }))} />
        <NumberField label="Lecture" value={form.lectureHours} onChange={(value) => setForm((current) => ({ ...current, lectureHours: value }))} />
        <NumberField label="Lab" value={form.labHours} onChange={(value) => setForm((current) => ({ ...current, labHours: value }))} />
        <NumberField label="Consultation" value={form.consultationHours} onChange={(value) => setForm((current) => ({ ...current, consultationHours: value }))} />
        <NumberField label="Assessment" value={form.assessmentHours} onChange={(value) => setForm((current) => ({ ...current, assessmentHours: value }))} />
        <Field label="Initial Status">
          <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as TeachingAssignmentStatus }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {[TeachingAssignmentStatus.DRAFT, TeachingAssignmentStatus.PENDING_APPROVAL, TeachingAssignmentStatus.APPROVED].map((status) => (
              <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <span className="text-sm font-medium text-gray-700">Roles</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.values(TeachingAssignmentRoleType).map((role) => (
            <label key={role} className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-sm text-gray-700">
              <input type="checkbox" checked={form.roles.includes(role)} onChange={() => toggleRole(role)} />
              <span>{role.replaceAll('_', ' ')}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr,auto]">
        <Field label="Notes">
          <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Optional notes" />
        </Field>
        <label className="flex items-center gap-2 pt-8 text-sm text-gray-700">
          <input type="checkbox" checked={form.isPrimary} onChange={(event) => setForm((current) => ({ ...current, isPrimary: event.target.checked }))} />
          Primary assignment
        </label>
      </div>

      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {loading ? 'Saving...' : 'Create Assignment'}
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

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input type="number" min="0" step="0.5" value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
    </Field>
  )
}
