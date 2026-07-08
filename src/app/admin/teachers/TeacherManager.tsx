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
      department?: { name: string }
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

  const createEmptyAssignment = () => ({
    departmentId: '',
    academicYearId: '',
    groupId: '',
    languageId: '',
    semesterId: '',
    subjectId: '',
  })

  const [assignRows, setAssignRows] = useState([createEmptyAssignment()])

  const resetAssignRows = () => {
    setAssignRows([createEmptyAssignment()])
  }

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
      const res = await fetch('/api/admin/teachers/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacherId: teacherProfileId,
          assignments: assignRows,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setShowAssignForm(null)
      resetAssignRows()
      router.refresh()
    } catch (err: any) { setError(err.message) }
    finally { setLoading(false) }
  }

  const updateAssignRow = (index: number, key: keyof ReturnType<typeof createEmptyAssignment>, value: string) => {
    setAssignRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row

        if (key === 'departmentId') {
          return {
            ...row,
            departmentId: value,
            subjectId: '',
            academicYearId: '',
            groupId: '',
            languageId: '',
            semesterId: '',
          }
        }

        if (key === 'academicYearId') {
          return {
            ...row,
            academicYearId: value,
            groupId: '',
            languageId: '',
            semesterId: '',
            subjectId: '',
          }
        }

        if (key === 'groupId') {
          return {
            ...row,
            groupId: value,
            languageId: '',
            semesterId: '',
            subjectId: '',
          }
        }

        if (key === 'languageId') {
          return {
            ...row,
            languageId: value,
            semesterId: '',
            subjectId: '',
          }
        }

        if (key === 'semesterId') {
          return {
            ...row,
            semesterId: value,
            subjectId: '',
          }
        }

        return {
          ...row,
          [key]: value,
        }
      })
    )
  }

  const addAssignRow = () => {
    setAssignRows((current) => [...current, createEmptyAssignment()])
  }

  const removeAssignRow = (index: number) => {
    setAssignRows((current) => current.filter((_, rowIndex) => rowIndex !== index))
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
                        {a.department?.name ? `${a.department.name} / ` : ''}{a.subject.name} / {a.group.name} / {a.academicYear.name} / {a.language.name} / {a.semester.name}
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-gray-900 mb-2">Assign Multiple Scopes</h3>
            <p className="text-sm text-gray-500 mb-4">
              Flow: Department to Year to Group to Language to Semester to Subject. You can add multiple assignment rows for the same teacher.
            </p>
            {error && <div className="mb-3 text-red-600 text-sm">{error}</div>}
            <div className="space-y-4">
              {assignRows.map((row, index) => {
                const filteredSubjects = subjects.filter((subject) => subject.departmentId === row.departmentId)

                return (
                  <div key={index} className="rounded-xl border border-gray-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="font-medium text-gray-900">Assignment {index + 1}</h4>
                      {assignRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeAssignRow(index)}
                          className="text-xs font-medium text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                        <select
                          value={row.departmentId}
                          onChange={(e) => updateAssignRow(index, 'departmentId', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
                          required
                        >
                          <option value="">Select department...</option>
                          {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year *</label>
                        <select
                          value={row.academicYearId}
                          onChange={(e) => updateAssignRow(index, 'academicYearId', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
                          required
                          disabled={!row.departmentId}
                        >
                          <option value="">Select year...</option>
                          {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Group *</label>
                        <select
                          value={row.groupId}
                          onChange={(e) => updateAssignRow(index, 'groupId', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
                          required
                          disabled={!row.academicYearId}
                        >
                          <option value="">Select group...</option>
                          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Language *</label>
                        <select
                          value={row.languageId}
                          onChange={(e) => updateAssignRow(index, 'languageId', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
                          required
                          disabled={!row.groupId}
                        >
                          <option value="">Select language...</option>
                          {languages.map((language) => <option key={language.id} value={language.id}>{language.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Semester *</label>
                        <select
                          value={row.semesterId}
                          onChange={(e) => updateAssignRow(index, 'semesterId', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
                          required
                          disabled={!row.languageId}
                        >
                          <option value="">Select semester...</option>
                          {semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                        <select
                          value={row.subjectId}
                          onChange={(e) => updateAssignRow(index, 'subjectId', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
                          required
                          disabled={!row.departmentId || !row.semesterId}
                        >
                          <option value="">Select subject...</option>
                          {filteredSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={addAssignRow}
                className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                + Add Another Assignment
              </button>
            </div>

            <div className="flex gap-3 mt-4">
              <button onClick={() => handleAssign(showAssignForm)} disabled={loading}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Saving...' : 'Save Assignments'}
              </button>
              <button onClick={() => { setShowAssignForm(null); resetAssignRows() }}
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
