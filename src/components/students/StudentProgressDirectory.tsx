'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Eye, Loader2, RefreshCw, Users } from 'lucide-react'
import type { StudentDirectoryItem } from '@/services/student-progress.service'

type FilterOption = {
  id: string
  name: string
}

type Props = {
  title: string
  subtitle: string
  initialStudents: StudentDirectoryItem[]
  years: FilterOption[]
  groups: FilterOption[]
  languages: FilterOption[]
  detailBasePath: string
}

function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`
}

export default function StudentProgressDirectory({
  title,
  subtitle,
  initialStudents,
  years,
  groups,
  languages,
  detailBasePath,
}: Props) {
  const [students, setStudents] = useState(initialStudents)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedYearId, setSelectedYearId] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedLanguageId, setSelectedLanguageId] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    const loadStudents = async () => {
      setLoading(true)
      setError(null)

      try {
        const searchParams = new URLSearchParams()
        if (selectedYearId) searchParams.set('academicYearId', selectedYearId)
        if (selectedGroupId) searchParams.set('groupId', selectedGroupId)
        if (selectedLanguageId) searchParams.set('languageId', selectedLanguageId)

        const res = await fetch(`/api/students?${searchParams.toString()}`, {
          signal: controller.signal,
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load students')
        setStudents(data)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load students'
        if (err instanceof Error && err.name === 'AbortError') return
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    loadStudents()
    return () => controller.abort()
  }, [selectedYearId, selectedGroupId, selectedLanguageId])

  const resetFilters = () => {
    setSelectedYearId('')
    setSelectedGroupId('')
    setSelectedLanguageId('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-gray-500">{subtitle}</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[760px]">
          <select
            value={selectedYearId}
            onChange={(event) => {
              setSelectedYearId(event.target.value)
              setSelectedGroupId('')
            }}
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500"
          >
            <option value="">All years</option>
            {years.map((year) => (
              <option key={year.id} value={year.id}>{year.name}</option>
            ))}
          </select>
          <select
            value={selectedGroupId}
            onChange={(event) => setSelectedGroupId(event.target.value)}
            className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500"
          >
            <option value="">All groups</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
          <div className="flex gap-3">
            <select
              value={selectedLanguageId}
              onChange={(event) => setSelectedLanguageId(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-500"
            >
              <option value="">All languages</option>
              {languages.map((language) => (
                <option key={language.id} value={language.id}>{language.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <SummaryCard label="Visible Students" value={students.length} />
        <SummaryCard label="Avg Score" value={students.length ? formatPercentage(students.reduce((sum, student) => sum + student.averageScore, 0) / students.length) : '0.0%'} />
        <SummaryCard label="Published Results" value={students.reduce((sum, student) => sum + student.publishedResultsCount, 0)} />
        <SummaryCard label="Completed Attempts" value={students.reduce((sum, student) => sum + student.completedAttemptsCount, 0)} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-5 py-3 text-left">Student</th>
                <th className="px-5 py-3 text-left">Department</th>
                <th className="px-5 py-3 text-left">Year</th>
                <th className="px-5 py-3 text-left">Progress</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {students.map((student) => (
                <tr key={student.id} className="align-top hover:bg-gray-50">
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                        {student.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{student.name}</p>
                        <p className="text-xs text-gray-500">{student.email}</p>
                        {student.course && (
                          <p className="mt-1 text-xs font-medium text-blue-700">{student.course}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">{student.departmentName}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">
                    {[...new Set(student.subjects.map((subject) => subject.academicYear))].join(', ') || '-'}
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-1 text-sm text-gray-600">
                      <p><span className="font-medium text-gray-800">Enrolled:</span> {student.enrolledSubjectsCount}</p>
                      <p><span className="font-medium text-gray-800">Attempts:</span> {student.attemptsCount}</p>
                      <p><span className="font-medium text-gray-800">Avg:</span> {formatPercentage(student.averageScore)}</p>
                      <p><span className="font-medium text-gray-800">Pass Rate:</span> {formatPercentage(student.passRate)}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${student.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {student.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <Link
                      href={`${detailBasePath}/${student.id}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-50"
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">
                    {loading ? 'Loading students...' : 'No students found for the selected filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {loading && students.length > 0 && (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Refreshing students...
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <Users className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}
