'use client'

import { useState } from 'react'

type StudentOption = {
  value: string
  label: string
}

type Props = {
  students: StudentOption[]
}

export default function StudentTimelineInspector({ students }: Props) {
  const [studentId, setStudentId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<string | null>(null)

  const loadTimeline = async () => {
    if (!studentId) return
    setLoading(true)
    setError(null)
    setTimeline(null)

    try {
      const res = await fetch(`/api/admin/enrollments/${studentId}/timeline`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Failed to load timeline')
      }
      setTimeline(JSON.stringify(data, null, 2))
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load timeline')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Timeline Viewer</h2>
        <p className="mt-1 text-sm text-gray-500">Load the append-only lifecycle timeline for any in-scope student.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={studentId}
          onChange={(event) => setStudentId(event.target.value)}
          className="min-w-[280px] rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          <option value="">Select student...</option>
          {students.map((student) => (
            <option key={student.value} value={student.value}>
              {student.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={loadTimeline}
          disabled={loading || !studentId}
          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'View timeline'}
        </button>
      </div>

      {error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {timeline ? <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">{timeline}</pre> : null}
    </section>
  )
}
