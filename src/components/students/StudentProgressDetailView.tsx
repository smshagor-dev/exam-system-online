'use client'

import { useState } from 'react'
import { Eye, Users } from 'lucide-react'
import type { StudentProgressDetail, StudentSelfProgressSubjectDetail } from '@/services/student-progress.service'

type Props = {
  detail: StudentProgressDetail
}

function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function prettifyKey(key: string) {
  return key
    .replace(/^course$/, 'Course')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function renderValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function statusTone(value: number) {
  if (value >= 80) return 'text-emerald-600'
  if (value >= 50) return 'text-amber-600'
  return 'text-rose-600'
}

export default function StudentProgressDetailView({ detail }: Props) {
  const [selectedSubject, setSelectedSubject] = useState<StudentSelfProgressSubjectDetail | null>(null)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{detail.name}</h1>
        <p className="mt-1 text-sm text-gray-500">{detail.email} · {detail.departmentName}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Enrolled Scopes" value={detail.enrolledSubjectsCount} />
        <SummaryCard label="Eligible Exams" value={detail.eligibleExamCount} />
        <SummaryCard label="Attempts" value={detail.attemptsCount} />
        <SummaryCard label="Published Results" value={detail.publishedResultsCount} />
        <SummaryCard label="Average Score" value={formatPercentage(detail.averageScore)} />
        <SummaryCard label="Pass Rate" value={formatPercentage(detail.passRate)} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.35fr]">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
          <h2 className="text-base font-semibold text-gray-900">Student Info</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-600">
            <InfoRow label="Department" value={detail.departmentName} />
            <InfoRow label="Phone" value={detail.phone || '-'} />
            <InfoRow label="Course" value={detail.course || '-'} />
            <InfoRow label="Last Activity" value={formatDate(detail.latestExamDate)} />
            <InfoRow label="Pending Results" value={detail.pendingResultCount} />
            <InfoRow label="Status" value={detail.isActive ? 'Active' : 'Inactive'} />
          </div>

          {detail.customFieldResponses && Object.keys(detail.customFieldResponses).length > 0 && (
            <div className="mt-5 rounded-2xl border border-blue-100 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-900">Additional Info</h3>
              <div className="mt-3 space-y-2 text-sm text-gray-600">
                {Object.entries(detail.customFieldResponses).map(([key, value]) => (
                  <div key={key} className="flex items-start justify-between gap-3">
                    <span className="font-medium text-gray-800">{prettifyKey(key)}</span>
                    <span className="text-right">{renderValue(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Academic Scope</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-3">Subject</th>
                  <th className="px-3 py-3">Year</th>
                  <th className="px-3 py-3">Semester</th>
                  <th className="px-3 py-3">Group</th>
                  <th className="px-3 py-3">Language</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {detail.subjects.map((subject) => (
                  <tr key={subject.id}>
                    <td className="px-3 py-3 text-sm font-medium text-gray-900">{subject.subject}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{subject.academicYear}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{subject.semester}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{subject.group}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{subject.language}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Result History</h2>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-3 py-3">Subject</th>
                <th className="px-3 py-3">Semester</th>
                <th className="px-3 py-3">Group / Language</th>
                <th className="px-3 py-3">Results</th>
                <th className="px-3 py-3">Attempts</th>
                <th className="px-3 py-3">Average</th>
                <th className="px-3 py-3">Pass Rate</th>
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {detail.subjectProgressYears.length > 0 ? detail.subjectProgressYears.flatMap((year) => {
                const yearAverage = year.subjects.length > 0
                  ? year.subjects.reduce((sum, subject) => sum + subject.averageScore, 0) / year.subjects.length
                  : 0

                return [
                  <tr key={`${year.academicYearId}-heading`} className="bg-gray-50">
                    <td colSpan={8} className="px-3 py-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-base font-semibold text-gray-900">{year.academicYearName}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {year.subjects.length} subject{year.subjects.length > 1 ? 's' : ''} in this year
                          </p>
                        </div>
                        <div className="text-sm text-gray-500">
                          Avg:{' '}
                          <span className={`font-semibold ${statusTone(yearAverage)}`}>
                            {formatPercentage(yearAverage)}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>,
                  ...year.subjects.map((subject) => (
                    <tr key={subject.scopeId} className="bg-white">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900">{subject.subjectName}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{subject.semesterName}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{subject.groupName} · {subject.languageName}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{subject.publishedResultsCount}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{subject.attemptsCount}</td>
                      <td className={`px-3 py-3 text-sm font-medium ${statusTone(subject.averageScore)}`}>{formatPercentage(subject.averageScore)}</td>
                      <td className={`px-3 py-3 text-sm font-medium ${statusTone(subject.passRate)}`}>{formatPercentage(subject.passRate)}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedSubject(subject)}
                          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-50"
                        >
                          <Eye className="h-4 w-4" />
                          View Progress
                        </button>
                      </td>
                    </tr>
                  )),
                ]
              }) : (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-400">
                    No subject-wise result history yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-gray-200 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">{selectedSubject.academicYearName}</p>
                <h2 className="mt-2 text-2xl font-bold text-gray-900">{selectedSubject.subjectName}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedSubject.semesterName} · {selectedSubject.groupName} · {selectedSubject.languageName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubject(null)}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-6 px-6 py-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                <SummaryCard label="Eligible Exams" value={selectedSubject.eligibleExamCount} />
                <SummaryCard label="Attempts" value={selectedSubject.attemptsCount} />
                <SummaryCard label="Completed" value={selectedSubject.completedAttemptsCount} />
                <SummaryCard label="Published" value={selectedSubject.publishedResultsCount} />
                <SummaryCard label="Average Score" value={formatPercentage(selectedSubject.averageScore)} />
                <SummaryCard label="Pass Rate" value={formatPercentage(selectedSubject.passRate)} />
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr]">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <h3 className="text-base font-semibold text-gray-900">Subject Summary</h3>
                  <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-600">
                    <InfoRow label="Academic Year" value={selectedSubject.academicYearName} />
                    <InfoRow label="Semester" value={selectedSubject.semesterName} />
                    <InfoRow label="Group" value={selectedSubject.groupName} />
                    <InfoRow label="Language" value={selectedSubject.languageName} />
                    <InfoRow label="Pending Results" value={selectedSubject.pendingResultCount} />
                    <InfoRow label="Last Activity" value={formatDate(selectedSubject.latestActivity)} />
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                  <h3 className="text-base font-semibold text-gray-900">Published Results</h3>
                  <div className="mt-4 space-y-3">
                    {selectedSubject.results.map((result) => (
                      <div key={result.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-semibold text-gray-900">{result.examTitle}</p>
                            <p className="mt-1 text-xs text-gray-500">Published: {formatDate(result.publishedAt)}</p>
                          </div>
                          <div className="text-right">
                            <p className={`text-base font-bold ${statusTone(result.percentage)}`}>{formatPercentage(result.percentage)}</p>
                            <p className="text-xs text-gray-500">{result.marksObtained}/{result.totalMarks}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {selectedSubject.results.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
                        No results for this subject yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <h3 className="text-base font-semibold text-gray-900">Exam Attempts</h3>
                <div className="mt-4 space-y-3">
                  {selectedSubject.attempts.length > 0 ? selectedSubject.attempts.map((attempt) => (
                    <div key={attempt.id} className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{attempt.examTitle}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs text-gray-600 md:flex md:items-center md:gap-6">
                        <span><span className="font-medium text-gray-800">Status:</span> {attempt.status}</span>
                        <span><span className="font-medium text-gray-800">Started:</span> {formatDate(attempt.startedAt)}</span>
                        <span><span className="font-medium text-gray-800">Submitted:</span> {formatDate(attempt.submittedAt)}</span>
                        <span><span className="font-medium text-gray-800">Time:</span> {attempt.timeSpent ? `${attempt.timeSpent} min` : '-'}</span>
                        <span><span className="font-medium text-gray-800">Result:</span> {attempt.resultPercentage != null ? formatPercentage(attempt.resultPercentage) : '-'}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
                      No exam attempts yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
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

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-white px-3 py-2">
      <span className="font-medium text-gray-800">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
