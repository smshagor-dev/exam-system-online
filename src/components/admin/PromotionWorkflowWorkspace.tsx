'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StudentLifecycleTable from './StudentLifecycleTable'
import { getFilteredFieldOptions, reconcileDependentSelections, type SimpleEntityField } from './simple-entity-form'

type ActiveStudent = {
  id: string
  label: string
  currentProgram: string
  currentYear: string
  currentSemester: string
  currentGroup: string
}

type Column = {
  key: string
  label: string
}

type Props = {
  fields: SimpleEntityField[]
  activeStudents: ActiveStudent[]
  columns: Column[]
  rows: Array<Record<string, string | number | null | undefined>>
}

function serializeForm(form: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(form).map(([key, value]) => [key, value === 'true' ? true : value === 'false' ? false : value]),
  )
}

export default function PromotionWorkflowWorkspace({ fields, activeStudents, columns, rows }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<Record<string, string>>({})
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([])
  const [output, setOutput] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  const updateForm = (nextForm: Record<string, string>) => {
    setForm(reconcileDependentSelections(fields, nextForm))
  }

  const run = async (endpoint: string, body: Record<string, unknown>, label: string, refresh = false) => {
    setLoading(label)
    setError(null)
    setOutput(null)

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : `${label} failed`)
      }
      setOutput(JSON.stringify(data, null, 2))
      if (refresh) {
        router.refresh()
      }
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : `${label} failed`)
    } finally {
      setLoading(null)
    }
  }

  const basePayload = serializeForm(form)

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">Promotion Workflow</h1>
          <p className="mt-1 text-sm text-gray-500">
            Preview semester progression, inspect rejection reasons, promote individual students, or run scoped bulk promotions with documented overrides.
          </p>
        </div>

        {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <div className="grid gap-4 md:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {field.label}
                {field.required ? ' *' : ''}
              </label>
              {field.type === 'select' ? (
                (() => {
                  const options = getFilteredFieldOptions(field, form)
                  const blocked = (field.dependsOn ?? []).some((dependency) => !form[dependency])
                  return (
                    <select
                      value={form[field.key] ?? ''}
                      onChange={(event) => updateForm({ ...form, [field.key]: event.target.value })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      required={field.required}
                      disabled={blocked}
                    >
                      <option value="">Select...</option>
                      {options.map((option) => (
                        <option key={`${field.key}:${option.value}:${option.label}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )
                })()
              ) : field.type === 'checkbox' ? (
                <label className="flex items-center gap-3 rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form[field.key] === 'true'}
                    onChange={(event) => updateForm({ ...form, [field.key]: String(event.target.checked) })}
                  />
                  <span>{field.label}</span>
                </label>
              ) : field.type === 'textarea' ? (
                <textarea
                  value={form[field.key] ?? ''}
                  onChange={(event) => updateForm({ ...form, [field.key]: event.target.value })}
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              ) : (
                <input
                  type={field.type}
                  value={form[field.key] ?? ''}
                  onChange={(event) => updateForm({ ...form, [field.key]: event.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  required={field.required}
                />
              )}
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => run('/api/admin/promotions/preview', basePayload, 'Preview student')}
            disabled={loading !== null}
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
          >
            {loading === 'Preview student' ? 'Previewing...' : 'Preview student'}
          </button>
          <button
            type="button"
            onClick={() => run('/api/admin/promotions', basePayload, 'Promote student', true)}
            disabled={loading !== null}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {loading === 'Promote student' ? 'Promoting...' : 'Promote student'}
          </button>
          <button
            type="button"
            onClick={() => run('/api/admin/promotions/preview', { ...basePayload, studentIds: selectedStudentIds }, 'Preview selected')}
            disabled={loading !== null || selectedStudentIds.length === 0}
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
          >
            {loading === 'Preview selected' ? 'Previewing bulk...' : `Preview selected (${selectedStudentIds.length})`}
          </button>
          <button
            type="button"
            onClick={() => run('/api/admin/promotions/bulk', { ...basePayload, studentIds: selectedStudentIds }, 'Promote selected', true)}
            disabled={loading !== null || selectedStudentIds.length === 0}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
          >
            {loading === 'Promote selected' ? 'Promoting bulk...' : `Promote selected (${selectedStudentIds.length})`}
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Eligible student candidates</h2>
            <p className="mt-1 text-xs text-gray-500">Use the checkboxes for bulk preview/execution. Individual actions use the student selector above.</p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {activeStudents.map((student) => (
              <label key={student.id} className="flex items-start gap-3 border-b border-gray-100 px-4 py-3 text-sm text-gray-700 last:border-b-0">
                <input
                  type="checkbox"
                  checked={selectedStudentIds.includes(student.id)}
                  onChange={(event) => {
                    setSelectedStudentIds((current) =>
                      event.target.checked ? [...current, student.id] : current.filter((item) => item !== student.id),
                    )
                  }}
                />
                <span>
                  <span className="block font-medium text-gray-900">{student.label}</span>
                  <span className="block text-xs text-gray-500">
                    {student.currentProgram} | {student.currentYear} | {student.currentSemester} | {student.currentGroup}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {output ? <pre className="mt-5 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{output}</pre> : null}
      </section>

      <StudentLifecycleTable
        title="Promotion Log"
        description="Promotion history including overrides, from/to academic context, and persisted status."
        columns={columns}
        rows={rows}
      />
    </div>
  )
}
