'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StudentLifecycleTable from './StudentLifecycleTable'
import { getFilteredFieldOptions, reconcileDependentSelections, type SimpleEntityField } from './simple-entity-form'

type Column = {
  key: string
  label: string
}

type Props = {
  title: string
  description: string
  actionEndpoint: string
  actionLabel: string
  fields: SimpleEntityField[]
  recordsTitle: string
  recordsDescription?: string
  columns: Column[]
  rows: Array<Record<string, string | number | null | undefined>>
  previewEndpoint?: string
  previewLabel?: string
}

function serializeForm(fields: SimpleEntityField[], form: Record<string, string>) {
  const fieldMap = new Map(fields.map((field) => [field.key, field]))
  return Object.fromEntries(
    Object.entries(form).map(([key, value]) => {
      const field = fieldMap.get(key)
      if (field?.type === 'checkbox') {
        return [key, value === 'true']
      }
      if (field?.type === 'number') {
        return [key, value === '' ? null : Number(value)]
      }
      return [key, value]
    }),
  )
}

function extractErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === 'object' && 'error' in data) {
    const candidate = (data as { error?: unknown }).error
    if (typeof candidate === 'string' && candidate.trim()) return candidate
    if (candidate && typeof candidate === 'object') {
      const flatten = candidate as { formErrors?: string[]; fieldErrors?: Record<string, string[]> }
      const messages: string[] = []
      if (Array.isArray(flatten.formErrors)) {
        messages.push(...flatten.formErrors)
      }
      if (flatten.fieldErrors) {
        for (const [field, fieldErrors] of Object.entries(flatten.fieldErrors)) {
          messages.push(...fieldErrors.map((message) => `${field}: ${message}`))
        }
      }
      if (messages.length > 0) {
        return messages.join(', ')
      }
    }
  }

  return fallback
}

export default function StudentLifecycleActionWorkspace({
  title,
  description,
  actionEndpoint,
  actionLabel,
  fields,
  recordsTitle,
  recordsDescription,
  columns,
  rows,
  previewEndpoint,
  previewLabel = 'Preview',
}: Props) {
  const router = useRouter()
  const [form, setForm] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [previewResult, setPreviewResult] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [previewing, setPreviewing] = useState(false)

  const updateForm = (nextForm: Record<string, string>) => {
    setForm(reconcileDependentSelections(fields, nextForm))
  }

  const handleAction = async (endpoint: string, mode: 'submit' | 'preview') => {
    const setLoading = mode === 'submit' ? setSubmitting : setPreviewing
    setLoading(true)
    setError(null)
    if (mode === 'submit') {
      setSuccess(null)
    } else {
      setPreviewResult(null)
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serializeForm(fields, form)),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(extractErrorMessage(data, `${mode === 'submit' ? actionLabel : previewLabel} failed`))
      }

      const summary = JSON.stringify(data, null, 2)
      if (mode === 'submit') {
        setSuccess(`${actionLabel} completed successfully.`)
        setPreviewResult(summary)
        router.refresh()
      } else {
        setPreviewResult(summary)
      }
    } catch (submitError: unknown) {
      setError(submitError instanceof Error ? submitError.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>

        {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

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
          {previewEndpoint ? (
            <button
              type="button"
              onClick={() => handleAction(previewEndpoint, 'preview')}
              disabled={previewing}
              className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
            >
              {previewing ? 'Previewing...' : previewLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => handleAction(actionEndpoint, 'submit')}
            disabled={submitting}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : actionLabel}
          </button>
        </div>

        {previewResult ? (
          <pre className="mt-5 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{previewResult}</pre>
        ) : null}
      </section>

      <StudentLifecycleTable
        title={recordsTitle}
        description={recordsDescription}
        columns={columns}
        rows={rows}
      />
    </div>
  )
}
