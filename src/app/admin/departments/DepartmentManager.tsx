'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Department = {
  id: string
  name: string
  code: string
  description: string | null
  isActive: boolean
  admin: { name: string; email: string } | null
  _count: { subjects: number; teachers: number; students: number }
}

export default function DepartmentManager({
  departments,
  canCreate = true,
  canDelete = true,
}: {
  departments: Department[]
  canCreate?: boolean
  canDelete?: boolean
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', code: '', description: '' })

  const resetForm = () => {
    setForm({ name: '', code: '', description: '' })
    setEditingId(null)
    setError(null)
  }

  const startEdit = (dept: Department) => {
    setForm({ name: dept.name, code: dept.code, description: dept.description ?? '' })
    setEditingId(dept.id)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const url = editingId ? `/api/admin/departments/${editingId}` : '/api/admin/departments'
      const method = editingId ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save department')
      }

      resetForm()
      setShowForm(false)
      router.refresh()
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Failed to save department')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) return

    try {
      const res = await fetch(`/api/admin/departments/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      router.refresh()
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'Failed to delete')
    }
  }

  return (
    <div className="space-y-4">
      {/* Add button */}
      {canCreate && (
        <div className="flex justify-end">
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            + Add Department
          </button>
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            {editingId ? 'Edit Department' : 'New Department'}
          </h3>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                required
                placeholder="Computer Science"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                required
                placeholder="CSE"
                maxLength={10}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                rows={2}
                placeholder="Optional description..."
              />
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm() }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Department</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Code</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Subjects</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Teachers</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Students</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {departments.map((dept) => (
              <tr key={dept.id} className="hover:bg-gray-50">
                <td className="px-5 py-4">
                  <p className="font-medium text-gray-900 text-sm">{dept.name}</p>
                  {dept.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{dept.description}</p>
                  )}
                </td>
                <td className="px-5 py-4">
                  <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">{dept.code}</span>
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">{dept._count.subjects}</td>
                <td className="px-5 py-4 text-sm text-gray-600">{dept._count.teachers}</td>
                <td className="px-5 py-4 text-sm text-gray-600">{dept._count.students}</td>
                <td className="px-5 py-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(dept)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Edit
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(dept.id, dept.name)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {departments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                  No departments yet. Add your first department above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
