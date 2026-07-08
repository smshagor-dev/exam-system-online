'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Column = {
  key: string
  label: string
}

type Field = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number'
  required?: boolean
  options?: { value: string; label: string }[]
}

type Props = {
  title: string
  items: any[]
  columns: Column[]
  fields: Field[]
  apiBase: string
  canCreate?: boolean
  canEdit?: boolean
  canDelete?: boolean
}

export default function SimpleEntityManager({
  title,
  items,
  columns,
  fields,
  apiBase,
  canCreate = true,
  canEdit = true,
  canDelete = true,
}: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})

  const resetForm = () => {
    setForm({})
    setEditingId(null)
    setError(null)
  }

  const startEdit = (item: any) => {
    const init: Record<string, string> = {}
    fields.forEach((field) => {
      init[field.key] = item[field.key] ?? ''
    })
    setForm(init)
    setEditingId(item.id)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const url = editingId ? `${apiBase}/${editingId}` : apiBase
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Save failed')
      }

      resetForm()
      setShowForm(false)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return

    try {
      const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Delete failed')
      }
      router.refresh()
    } catch (err: any) {
      alert(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-gray-500">
            {items.length} item{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            + Add {title.slice(0, -1)}
          </button>
        )}
      </div>

      {showForm && canCreate && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">
            {editingId ? 'Edit' : 'New'} {title.slice(0, -1)}
          </h3>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {fields.map((field) => (
              <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {field.label} {field.required && '*'}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={form[field.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    required={field.required}
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    value={form[field.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    rows={2}
                  />
                ) : (
                  <input
                    type={field.type}
                    value={form[field.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
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
                {loading ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  resetForm()
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
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
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                {columns.map((col) => (
                  <td key={col.key} className="px-5 py-4 text-sm text-gray-700">
                    {item[col.key] ?? '—'}
                  </td>
                ))}
                {(canEdit || canDelete) && (
                  <td className="px-5 py-4">
                    <div className="flex gap-3">
                      {canEdit && (
                        <button onClick={() => startEdit(item)} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(item.id, item.name)}
                          className="text-xs font-medium text-red-600 hover:text-red-700"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={columns.length + (canEdit || canDelete ? 1 : 0)} className="px-5 py-10 text-center text-sm text-gray-400">
                  No items yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
