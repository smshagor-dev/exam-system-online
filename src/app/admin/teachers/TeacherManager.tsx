'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Teacher = {
  id: string
  name: string
  email: string
  isActive: boolean
  teacherProfile: {
    id: string
    department: { name: string }
    assignments: {
      id: string
      subject: { name: string }
      language: { name: string }
      group: { name: string }
      academicYear: { name: string }
      semester: { name: string }
    }[]
  } | null
}

type Props = {
  teachers: Teacher[]
  departments: { id: string; name: string }[]
  subjects: { id: string; name: string; departmentId: string }[]
  languages: { id: string; name: string }[]
  groups: { id: string; name: string }[]
  years: { id: string; name: string }[]
  semesters: { id: string; name: string }[]
  canCreateTeacher?: boolean
}

export default function TeacherManager({
  teachers,
  departments,
  subjects,
  languages,
  groups,
  years,
  semesters,
  canCreateTeacher = true,
}: Props) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [showAssignForm, setShowAssignForm] = useState<string | null>(null) // teacher profile id
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '', email: '', password: '', departmentId: '', phone: '',
  })

  const [assignForm, setAssignForm] = useState({
    subjectId: '', languageId: '', groupId: '', academicYearId: '', semesterId: '',
  })

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setShowForm(false)
      setForm({ name: '', email: '', password: '', departmentId: '', phone: '' })
      router.refresh()
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  const handleAssign = async (teacherProfileId: string) => {
    setLoading(true); setError(null)
    try {
      const teacher = teachers.find((t) => t.teacherProfile?.id === teacherProfileId)
      if (!teacher?.teacherProfile) return
      const res = await fetch('/api/admin/teachers/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: teacherProfileId,
          departmentId: teacher.teacherProfile ? departments.find(d => d.name === teacher.teacherProfile!.department.name)?.id : '',
          ...assignForm,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setShowAssignForm(null)
      setAssignForm({ subjectId: '', languageId: '', groupId: '', academicYearId: '', semesterId: '' })
      router.refresh()
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teachers</h1>
          <p className="text-gray-500 mt-1">{teachers.length} registered teachers</p>
        </div>
        {canCreateTeacher && (
          <button onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            + Add Teacher
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {/* Create Teacher Form */}
      {showForm && canCreateTeacher && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">New Teacher</h3>
          <form onSubmit={handleCreateTeacher} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'name', label: 'Full Name', type: 'text' },
              { key: 'email', label: 'Email', type: 'email' },
              { key: 'password', label: 'Password', type: 'password' },
              { key: 'phone', label: 'Phone (optional)', type: 'text' },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <input type={f.type} value={(form as any)[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                  required={f.key !== 'phone'} />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
              <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none" required>
                <option value="">Select department...</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button type="submit" disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Teacher'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Teachers Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
              <th className="px-5 py-3 text-left">Teacher</th>
              <th className="px-5 py-3 text-left">Department</th>
              <th className="px-5 py-3 text-left">Assignments</th>
              <th className="px-5 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {teachers.map((teacher) => (
              <tr key={teacher.id} className="hover:bg-gray-50">
                <td className="px-5 py-4">
                  <p className="font-medium text-gray-900 text-sm">{teacher.name}</p>
                  <p className="text-xs text-gray-400">{teacher.email}</p>
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">
                  {teacher.teacherProfile?.department.name ?? '—'}
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1">
                    {teacher.teacherProfile?.assignments.map((a) => (
                      <span key={a.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
                        {a.subject.name} / {a.group.name} / {a.academicYear.name} / {a.semester.name}
                      </span>
                    ))}
                    {(!teacher.teacherProfile?.assignments.length) && (
                      <span className="text-xs text-gray-400">No assignments</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4">
                  {teacher.teacherProfile && (
                    <button
                      onClick={() => setShowAssignForm(teacher.teacherProfile!.id)}
                      className="text-xs text-green-600 font-medium hover:text-green-700"
                    >
                      + Assign
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Assign Modal */}
      {showAssignForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="font-semibold text-gray-900 mb-4">Assign Subject / Group / Year / Semester</h3>
            {error && <div className="mb-3 text-red-600 text-sm">{error}</div>}
            <div className="space-y-3">
              {[
                { key: 'subjectId', label: 'Subject', items: subjects },
                { key: 'languageId', label: 'Language', items: languages },
                { key: 'groupId', label: 'Group', items: groups },
                { key: 'academicYearId', label: 'Academic Year', items: years },
                { key: 'semesterId', label: 'Semester', items: semesters },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <select
                    value={(assignForm as any)[f.key]}
                    onChange={(e) => setAssignForm({ ...assignForm, [f.key]: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
                    required
                  >
                    <option value="">Select...</option>
                    {f.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => handleAssign(showAssignForm)} disabled={loading}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Saving...' : 'Assign'}
              </button>
              <button onClick={() => setShowAssignForm(null)}
                className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
