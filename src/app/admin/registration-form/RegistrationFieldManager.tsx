'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n/LanguageProvider'

type Department = {
  id: string
  name: string
}

type RegistrationField = {
  id: string
  departmentId: string
  label: string
  key: string
  type: 'TEXT' | 'CHECKBOX' | 'SELECT'
  isRequired: boolean
  isActive: boolean
  placeholder: string | null
  options: string[] | null
  sortOrder: number
  department: {
    id: string
    name: string
  }
}

type Props = {
  fields: RegistrationField[]
  departments: Department[]
  canSelectDepartment: boolean
}

const FIELD_TYPE_OPTIONS: Array<RegistrationField['type']> = ['TEXT', 'CHECKBOX', 'SELECT']

export default function RegistrationFieldManager({ fields, departments, canSelectDepartment }: Props) {
  const { t } = useI18n()
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(departments[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    departmentId: departments[0]?.id ?? '',
    label: '',
    type: 'TEXT' as RegistrationField['type'],
    isRequired: false,
    isActive: true,
    placeholder: '',
    sortOrder: '0',
    optionsText: '',
  })

  const visibleFields = useMemo(
    () => fields.filter((field) => !selectedDepartmentId || field.departmentId === selectedDepartmentId),
    [fields, selectedDepartmentId]
  )

  const resetForm = () => {
    setEditingFieldId(null)
    setError(null)
    setForm({
      departmentId: selectedDepartmentId || (departments[0]?.id ?? ''),
      label: '',
      type: 'TEXT',
      isRequired: false,
      isActive: true,
      placeholder: '',
      sortOrder: String(visibleFields.length),
      optionsText: '',
    })
  }

  const startEdit = (field: RegistrationField) => {
    setEditingFieldId(field.id)
    setError(null)
    setShowForm(true)
    setForm({
      departmentId: field.departmentId,
      label: field.label,
      type: field.type,
      isRequired: field.isRequired,
      isActive: field.isActive,
      placeholder: field.placeholder ?? '',
      sortOrder: String(field.sortOrder),
      optionsText: Array.isArray(field.options) ? field.options.join('\n') : '',
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const payload = {
        departmentId: form.departmentId,
        label: form.label,
        type: form.type,
        isRequired: form.isRequired,
        isActive: form.isActive,
        placeholder: form.placeholder || null,
        sortOrder: Number(form.sortOrder || 0),
        options: form.type === 'SELECT'
          ? form.optionsText.split('\n').map((option) => option.trim()).filter(Boolean)
          : [],
      }

      const url = editingFieldId
        ? `/api/admin/registration-fields/${editingFieldId}`
        : '/api/admin/registration-fields'
      const method = editingFieldId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || t('admin.simple.save_failed', 'Save failed'))
      }

      setShowForm(false)
      resetForm()
      router.refresh()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : t('admin.simple.save_failed', 'Save failed'))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (field: RegistrationField) => {
    if (!confirm(`${t('common.delete', 'Delete')} "${field.label}"?`)) return

    const res = await fetch(`/api/admin/registration-fields/${field.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      alert(data.error || t('admin.simple.delete_failed', 'Delete failed'))
      return
    }

    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('admin.registration_builder.title', 'Registration Form Builder')}</h1>
          <p className="mt-1 text-gray-500">
            {t('admin.registration_builder.description', 'Admins can decide which extra fields students must fill after the current academic details.')}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('admin.registration_builder.department', 'Department')}</label>
            <select
              value={selectedDepartmentId}
              onChange={(event) => {
                setSelectedDepartmentId(event.target.value)
                if (!editingFieldId) {
                  setForm((current) => ({ ...current, departmentId: event.target.value }))
                }
              }}
              className="w-full min-w-[220px] rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              disabled={!canSelectDepartment && departments.length <= 1}
            >
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            + {t('admin.registration_builder.add_field', 'Add Dynamic Field')}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            {editingFieldId
              ? t('admin.registration_builder.edit_field', 'Edit Dynamic Field')
              : t('admin.registration_builder.new_field', 'New Dynamic Field')}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Available field types: `text input`, `checkbox`, and `selection`.
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('admin.registration_builder.department', 'Department')} *</label>
              <select
                value={form.departmentId}
                onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                disabled={!canSelectDepartment}
                required
              >
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('admin.registration_builder.field_label', 'Field Label *')}</label>
              <input
                type="text"
                value={form.label}
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="Example: Admission Shift"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('admin.registration_builder.field_type', 'Field Type *')}</label>
              <select
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as RegistrationField['type'] }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                {FIELD_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('admin.registration_builder.sort_order', 'Sort Order')}</label>
              <input
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('admin.registration_builder.placeholder', 'Placeholder')}</label>
              <input
                type="text"
                value={form.placeholder}
                onChange={(event) => setForm((current) => ({ ...current, placeholder: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                placeholder="Optional helper text for students"
              />
            </div>

            {form.type === 'SELECT' && (
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('admin.registration_builder.selection_options', 'Selection Options *')}</label>
                <textarea
                  rows={4}
                  value={form.optionsText}
                  onChange={(event) => setForm((current) => ({ ...current, optionsText: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder={`Morning\nEvening\nWeekend`}
                  required
                />
                <p className="mt-1 text-xs text-gray-500">{t('admin.registration_builder.selection_help', 'Write one option per line.')}</p>
              </div>
            )}

            <div className="flex items-center gap-6 md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isRequired}
                  onChange={(event) => setForm((current) => ({ ...current, isRequired: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {t('common.required', 'Required')}
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {t('common.active', 'Active')}
              </label>
            </div>

            <div className="flex gap-3 md:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading
                  ? t('common.saving', 'Saving...')
                  : editingFieldId
                    ? t('admin.registration_builder.update_field', 'Update Field')
                    : t('admin.registration_builder.create_field', 'Create Field')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  resetForm()
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {t('common.cancel', 'Cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t('common.field', 'Field')}</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t('common.type', 'Type')}</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t('common.rules', 'Rules')}</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t('common.department', 'Department')}</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t('common.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visibleFields.map((field) => (
              <tr key={field.id} className="hover:bg-gray-50">
                <td className="px-5 py-4 text-sm text-gray-700">
                  <p className="font-medium text-gray-900">{field.label}</p>
                  <p className="mt-1 font-mono text-xs text-gray-400">{field.key}</p>
                  {field.placeholder && <p className="mt-1 text-xs text-gray-500">{field.placeholder}</p>}
                  {field.type === 'SELECT' && Array.isArray(field.options) && field.options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {field.options.map((option) => (
                        <span key={option} className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                          {option}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">{field.type}</td>
                <td className="px-5 py-4 text-sm text-gray-600">
                  <p>{field.isRequired ? t('common.required', 'Required') : t('common.optional', 'Optional')}</p>
                  <p className={field.isActive ? 'text-green-600' : 'text-gray-400'}>
                    {field.isActive ? t('common.active', 'Active') : t('common.inactive', 'Inactive')}
                  </p>
                  <p className="text-xs text-gray-400">Order: {field.sortOrder}</p>
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">{field.department.name}</td>
                <td className="px-5 py-4">
                  <div className="flex gap-3">
                    <button onClick={() => startEdit(field)} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                      {t('common.edit', 'Edit')}
                    </button>
                    <button onClick={() => handleDelete(field)} className="text-xs font-medium text-red-600 hover:text-red-700">
                      {t('common.delete', 'Delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {visibleFields.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-400">
                  {t('admin.registration_builder.no_fields', 'No dynamic fields configured for this department yet.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
