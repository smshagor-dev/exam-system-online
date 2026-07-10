'use client'

import { formatBytes } from '@/lib/ebooks'
import { formatCourseworkAccessRequestStatus, formatCourseworkDeadline, formatCourseworkStatus } from '@/lib/coursework'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

type ScopeOption = {
  departmentName: string
  subjectId: string
  subjectName: string
  languageId: string
  languageName: string
  groupId: string
  groupName: string
  academicYearId: string
  academicYearName: string
  semesterId: string
  semesterName: string
}

type SubmissionRow = {
  id: string
  studentName: string
  studentEmail: string
  title: string
  subjectId: string
  subjectName: string
  languageId: string
  languageName: string
  groupId: string
  groupName: string
  academicYearId: string
  academicYearName: string
  semesterId: string
  semesterName: string
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
  aiFeedback: string | null
  fileUrl: string
  fileName: string
  fileSizeBytes: number
  createdAt: string
  submissionDeadline: string | null
}

type AccessRequestRow = {
  id: string
  studentName: string
  studentEmail: string
  title: string
  subjectId: string
  subjectName: string
  languageId: string
  languageName: string
  groupId: string
  groupName: string
  academicYearId: string
  academicYearName: string
  semesterId: string
  semesterName: string
  message: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  teacherNote: string | null
  extensionDeadline: string | null
  createdAt: string
  originalDeadline: string | null
}

type Props = {
  scopeOptions: ScopeOption[]
  submissions: SubmissionRow[]
  accessRequests: AccessRequestRow[]
}

function statusClasses(status: 'PENDING' | 'ACCEPTED' | 'REJECTED') {
  if (status === 'ACCEPTED') return 'bg-emerald-100 text-emerald-700'
  if (status === 'REJECTED') return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-700'
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const timezoneOffset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16)
}

export default function TeacherCourseworkSubmissionsView({ scopeOptions, submissions, accessRequests }: Props) {
  const router = useRouter()
  const [academicYearId, setAcademicYearId] = useState(scopeOptions[0]?.academicYearId ?? '')
  const [semesterId, setSemesterId] = useState(scopeOptions.find((scope) => scope.academicYearId === (scopeOptions[0]?.academicYearId ?? ''))?.semesterId ?? '')
  const [groupId, setGroupId] = useState('')
  const [languageId, setLanguageId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [deadlineDrafts, setDeadlineDrafts] = useState<Record<string, string>>({})
  const [teacherNotes, setTeacherNotes] = useState<Record<string, string>>({})
  const [savingRequestId, setSavingRequestId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filteredByYear = useMemo(
    () => scopeOptions.filter((scope) => !academicYearId || scope.academicYearId === academicYearId),
    [scopeOptions, academicYearId]
  )
  const filteredBySemester = useMemo(
    () => filteredByYear.filter((scope) => !semesterId || scope.semesterId === semesterId),
    [filteredByYear, semesterId]
  )
  const filteredByGroup = useMemo(
    () => filteredBySemester.filter((scope) => !groupId || scope.groupId === groupId),
    [filteredBySemester, groupId]
  )
  const filteredByLanguage = useMemo(
    () => filteredByGroup.filter((scope) => !languageId || scope.languageId === languageId),
    [filteredByGroup, languageId]
  )

  const filteredSubmissions = useMemo(() => {
    return submissions.filter(
      (submission) =>
        (!academicYearId || submission.academicYearId === academicYearId) &&
        (!semesterId || submission.semesterId === semesterId) &&
        (!groupId || submission.groupId === groupId) &&
        (!languageId || submission.languageId === languageId) &&
        (!subjectId || submission.subjectId === subjectId)
    )
  }, [submissions, academicYearId, semesterId, groupId, languageId, subjectId])

  const filteredAccessRequests = useMemo(() => {
    return accessRequests.filter(
      (request) =>
        (!academicYearId || request.academicYearId === academicYearId) &&
        (!semesterId || request.semesterId === semesterId) &&
        (!groupId || request.groupId === groupId) &&
        (!languageId || request.languageId === languageId) &&
        (!subjectId || request.subjectId === subjectId)
    )
  }, [accessRequests, academicYearId, semesterId, groupId, languageId, subjectId])

  async function handleRequestAction(requestId: string, action: 'APPROVE' | 'REJECT') {
    setSavingRequestId(requestId)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch(`/api/coursework/access-requests/${requestId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          extensionDeadline: action === 'APPROVE' ? deadlineDrafts[requestId] ?? '' : null,
          teacherNote: teacherNotes[requestId] ?? '',
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update access request')
      }

      setMessage(action === 'APPROVE' ? 'Access request approved with deadline.' : 'Access request rejected.')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to update access request')
    } finally {
      setSavingRequestId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Submitted Course Work & Reports</h1>
        <p className="mt-1 text-sm text-slate-500">
          Filter submissions by year, semester, group, department language, and subject to review who submitted what.
        </p>
      </div>

      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-6">
          <label className="text-sm font-medium text-slate-700">
            Department
            <input
              type="text"
              value={scopeOptions[0]?.departmentName ?? ''}
              readOnly
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Academic Year
            <select
              value={academicYearId}
              onChange={(event) => {
                setAcademicYearId(event.target.value)
                setSemesterId('')
                setGroupId('')
                setLanguageId('')
                setSubjectId('')
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              {[...new Map(scopeOptions.map((scope) => [scope.academicYearId, scope])).values()].map((scope) => (
                <option key={scope.academicYearId} value={scope.academicYearId}>
                  {scope.academicYearName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Semester
            <select
              value={semesterId}
              onChange={(event) => {
                setSemesterId(event.target.value)
                setGroupId('')
                setLanguageId('')
                setSubjectId('')
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select semester</option>
              {[...new Map(filteredByYear.map((scope) => [scope.semesterId, scope])).values()].map((scope) => (
                <option key={scope.semesterId} value={scope.semesterId}>
                  {scope.semesterName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Group
            <select
              value={groupId}
              onChange={(event) => {
                setGroupId(event.target.value)
                setLanguageId('')
                setSubjectId('')
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select group</option>
              {[...new Map(filteredBySemester.map((scope) => [scope.groupId, scope])).values()].map((scope) => (
                <option key={scope.groupId} value={scope.groupId}>
                  {scope.groupName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Department Language
            <select
              value={languageId}
              onChange={(event) => {
                setLanguageId(event.target.value)
                setSubjectId('')
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select language</option>
              {[...new Map(filteredByGroup.map((scope) => [scope.languageId, scope])).values()].map((scope) => (
                <option key={scope.languageId} value={scope.languageId}>
                  {scope.languageName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Subject
            <select
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select subject</option>
              {[...new Map(filteredByLanguage.map((scope) => [scope.subjectId, scope])).values()].map((scope) => (
                <option key={scope.subjectId} value={scope.subjectId}>
                  {scope.subjectName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-xl font-semibold text-slate-900">Access Requests After Deadline</h2>
          <p className="mt-1 text-sm text-slate-500">Approve with a new access deadline or reject the student request.</p>
        </div>

        {filteredAccessRequests.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No access requests found for the selected filters.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredAccessRequests.map((request) => (
              <div key={request.id} className="px-6 py-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{request.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {request.studentName} | {request.studentEmail}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {request.subjectName} | {request.languageName} | {request.academicYearName} | {request.semesterName} | {request.groupName}
                    </p>
                  </div>
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {formatCourseworkAccessRequestStatus(request.status)}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr),320px]">
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">Student Request</p>
                      <p className="mt-2 whitespace-pre-wrap">{request.message || 'No message provided.'}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                      <p>Requested: {new Date(request.createdAt).toLocaleString()}</p>
                      <p className="mt-1">Original deadline: {formatCourseworkDeadline(request.originalDeadline)}</p>
                      {request.extensionDeadline ? (
                        <p className="mt-1">Current access deadline: {formatCourseworkDeadline(request.extensionDeadline)}</p>
                      ) : null}
                      {request.teacherNote ? <p className="mt-2">Teacher note: {request.teacherNote}</p> : null}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Access Deadline
                      <input
                        type="datetime-local"
                        value={deadlineDrafts[request.id] ?? toDateTimeLocalValue(request.extensionDeadline)}
                        onChange={(event) =>
                          setDeadlineDrafts((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                      />
                    </label>

                    <label className="block text-sm font-medium text-slate-700">
                      Teacher Note
                      <textarea
                        rows={4}
                        value={teacherNotes[request.id] ?? request.teacherNote ?? ''}
                        onChange={(event) =>
                          setTeacherNotes((current) => ({
                            ...current,
                            [request.id]: event.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                        placeholder="Optional note for the student"
                      />
                    </label>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => void handleRequestAction(request.id, 'APPROVE')}
                        disabled={savingRequestId === request.id}
                        className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingRequestId === request.id ? 'Saving...' : 'Approve Access'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRequestAction(request.id, 'REJECT')}
                        disabled={savingRequestId === request.id}
                        className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {filteredSubmissions.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center text-sm text-slate-500">
          No submissions found for the selected filters.
        </section>
      ) : (
        <div className="space-y-4">
          {filteredSubmissions.map((submission) => (
            <section key={submission.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{submission.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {submission.studentName} · {submission.studentEmail}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {submission.subjectName} · {submission.languageName} · {submission.academicYearName} · {submission.semesterName} · {submission.groupName}
                  </p>
                </div>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(submission.status)}`}>
                  {formatCourseworkStatus(submission.status)}
                </span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Submitted</p>
                  <p className="mt-2">{new Date(submission.createdAt).toLocaleString()}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Deadline</p>
                  <p className="mt-2">{formatCourseworkDeadline(submission.submissionDeadline)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">File</p>
                  <p className="mt-2">{submission.fileName}</p>
                  <p className="text-xs text-slate-500">{formatBytes(submission.fileSizeBytes)}</p>
                </div>
              </div>

              {submission.aiFeedback ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {submission.aiFeedback}
                </div>
              ) : null}

              <a
                href={submission.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-sm font-medium text-sky-600 hover:text-sky-700"
              >
                Open submitted DOCX
              </a>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
