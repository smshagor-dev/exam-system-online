'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n/LanguageProvider'
import { getFilteredFieldOptions, reconcileDependentSelections, type SimpleEntityField as Field } from './simple-entity-form'

type Column = {
  key: string
  label: string
}

type Props = {
  title: string
  items: Array<Record<string, unknown> & { id: string; name?: string | null }>
  columns: Column[]
  fields: Field[]
  apiBase: string
  singularLabel?: string
  canCreate?: boolean
  canEdit?: boolean
  canDelete?: boolean
  formMode?: 'inline' | 'modal'
}

function formatApiError(error: unknown, fallback: string) {
  if (typeof error === 'string' && error.trim()) return error

  if (error && typeof error === 'object') {
    const candidate = error as {
      formErrors?: unknown
      fieldErrors?: Record<string, unknown>
    }

    const messages: string[] = []

    if (Array.isArray(candidate.formErrors)) {
      messages.push(...candidate.formErrors.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))
    }

    if (candidate.fieldErrors && typeof candidate.fieldErrors === 'object') {
      for (const [field, value] of Object.entries(candidate.fieldErrors)) {
        if (Array.isArray(value)) {
          for (const message of value) {
            if (typeof message === 'string' && message.trim()) {
              messages.push(`${field}: ${message}`)
            }
          }
        }
      }
    }

    if (messages.length > 0) {
      return messages.join(', ')
    }
  }

  return fallback
}

export default function SimpleEntityManager({
  title,
  items,
  columns,
  fields,
  apiBase,
  singularLabel,
  canCreate = true,
  canEdit = true,
  canDelete = true,
  formMode = 'inline',
}: Props) {
  const { t } = useI18n()
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [formInstanceKey, setFormInstanceKey] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const submitLockRef = useRef(false)

  const resetForm = () => {
    setForm({})
    setEditingId(null)
    setError(null)
    setFormInstanceKey((current) => current + 1)
  }

  const updateForm = (nextForm: Record<string, string>) => {
    setForm(reconcileDependentSelections(fields, nextForm))
  }

  const startEdit = (item: Props['items'][number]) => {
    const init: Record<string, string> = {}
    fields.forEach((field) => {
      const value = item[field.key]
      init[field.key] = typeof value === 'boolean'
        ? String(value)
        : typeof value === 'string'
          ? value
          : value == null
            ? ''
            : String(value)
    })
    updateForm(init)
    setEditingId(item.id)
    setShowForm(true)
  }

  const entityLabel = singularLabel ?? title.replace(/s$/, '')
  const isModalForm = formMode === 'modal'
  const formTitle = `${editingId ? t('admin.simple.edit', 'Edit') : t('admin.simple.new', 'New')} ${entityLabel}`

  const closeForm = () => {
    setShowForm(false)
    resetForm()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitLockRef.current) return

    submitLockRef.current = true
    setLoading(true)
    setError(null)

    try {
      const url = editingId ? `${apiBase}/${editingId}` : apiBase
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          Object.fromEntries(
            Object.entries(form).map(([key, value]) => [key, value === 'true' ? true : value === 'false' ? false : value])
          )
        ),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(formatApiError(data.error, t('admin.simple.save_failed', 'Save failed')))
      }

      closeForm()
      router.refresh()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : t('admin.simple.save_failed', 'Save failed'))
    } finally {
      setLoading(false)
      submitLockRef.current = false
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${t('admin.simple.delete_confirm', 'Delete')} "${name}"?`)) return

    try {
      const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || t('admin.simple.delete_failed', 'Delete failed'))
      }
      router.refresh()
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : t('admin.simple.delete_failed', 'Delete failed'))
    }
  }

  const filteredItems = useMemo(() => {
    const searchValue = search.trim().toLowerCase()

    return items.filter((item) => {
      if (statusFilter !== 'all' && typeof item.isActive === 'boolean') {
        if (statusFilter === 'active' && !item.isActive) return false
        if (statusFilter === 'inactive' && item.isActive) return false
      }

      if (!searchValue) return true

      return columns.some((column) => String(item[column.key] ?? '').toLowerCase().includes(searchValue))
    })
  }, [columns, items, search, statusFilter])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-gray-500">
            {filteredItems.length} {t('admin.simple.items', 'items')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search', 'Search')}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          {items.some((item) => typeof item.isActive === 'boolean') && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          )}
          {canCreate && (
            <button
              onClick={() => {
                resetForm()
                setShowForm(true)
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              + {t('admin.simple.add', 'Add')} {entityLabel}
            </button>
          )}
        </div>
      </div>

      {showForm && canCreate && (
        <div className={isModalForm ? 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4' : ''}>
          <div className={isModalForm ? 'max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl' : 'rounded-xl border border-gray-200 bg-white p-6'}>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-gray-900">{formTitle}</h3>
                {isModalForm && (
                  <p className="mt-1 text-sm text-gray-500">Fill in the details and save when you are ready.</p>
                )}
              </div>
              {isModalForm && (
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-500 transition hover:bg-gray-50 hover:text-gray-700"
                >
                  {t('common.close', 'Close')}
                </button>
              )}
            </div>
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <form key={formInstanceKey} onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2" autoComplete="off">
              {fields.map((field) => (
                <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {field.label} {field.required && '*'}
                  </label>
                  {field.type === 'select' ? (
                    (() => {
                      const availableOptions = getFilteredFieldOptions(field, form)
                      const dependsOn = field.dependsOn ?? []
                      const isBlocked = dependsOn.length > 0 && dependsOn.some((dependencyKey) => !form[dependencyKey])

                      return (
                        <select
                          value={form[field.key] ?? ''}
                          onChange={(e) => updateForm({ ...form, [field.key]: e.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                          required={field.required}
                          disabled={isBlocked}
                        >
                          <option value="">{t('common.select', 'Select...')}</option>
                          {availableOptions.map((opt, index) => (
                            <option key={`${opt.value}:${index}`} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      )
                    })()
                  ) : field.type === 'checkbox' ? (
                    <label className="flex items-center gap-3 rounded-lg border border-gray-300 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form[field.key] === 'true'}
                        onChange={(e) => updateForm({ ...form, [field.key]: String(e.target.checked) })}
                      />
                      <span>{field.label}</span>
                    </label>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      value={form[field.key] ?? ''}
                      onChange={(e) => updateForm({ ...form, [field.key]: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      rows={2}
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={form[field.key] ?? ''}
                      onChange={(e) => updateForm({ ...form, [field.key]: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      required={field.required}
                    />
                  )}
                </div>
              ))}
              <div className="flex gap-3 md:col-span-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? t('common.saving', 'Saving...') : editingId ? t('common.update', 'Update') : t('common.create', 'Create')}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {columns.map((col) => (
                <th key={col.key} className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                  {col.label}
                </th>
              ))}
              {(canEdit || canDelete) && (
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">{t('common.actions', 'Actions')}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-4 text-sm text-gray-700">
                    {(() => {
                      const value = item[col.key]
                      return typeof value === 'object' ? '—' : String(value ?? '—')
                    })()}
                  </td>
                ))}
                {(canEdit || canDelete) && (
                  <td className="px-5 py-4">
                    <div className="flex gap-3">
                      {canEdit && (
                        <button onClick={() => startEdit(item)} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                          {t('common.edit', 'Edit')}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(item.id, item.name ?? item.id)}
                          className="text-xs font-medium text-red-600 hover:text-red-700"
                        >
                          {t('common.delete', 'Delete')}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={columns.length + (canEdit || canDelete ? 1 : 0)} className="px-5 py-10 text-center text-sm text-gray-400">
                  {t('common.no_items_yet', 'No items yet')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
