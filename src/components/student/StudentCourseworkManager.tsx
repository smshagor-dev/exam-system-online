'use client'

import { formatBytes } from '@/lib/ebooks'
import { formatCourseworkAccessRequestStatus, formatCourseworkDeadline, formatCourseworkStatus, getCourseworkActiveDeadline, isCourseworkDeadlinePassed } from '@/lib/coursework'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type CourseworkAssignmentCard = {
  id: string
  title: string
  rules: string
  teacherName: string
  subjectName: string
  languageName: string
  groupName: string
  academicYearName: string
  semesterName: string
  submissionDeadline: string | null
  latestAccessRequest: {
    status: 'PENDING' | 'APPROVED' | 'REJECTED'
    message: string | null
    teacherNote: string | null
    extensionDeadline: string | null
    createdAt: string
    canSubmitWithAccess: boolean
  } | null
  latestSubmission: {
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
    aiFeedback: string | null
    fileUrl: string
    fileName: string
    fileSizeBytes: number
    createdAt: string
  } | null
}

type Props = {
  assignments: CourseworkAssignmentCard[]
}

function statusClasses(status: 'PENDING' | 'ACCEPTED' | 'REJECTED') {
  if (status === 'ACCEPTED') return 'bg-emerald-100 text-emerald-700'
  if (status === 'REJECTED') return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-700'
}

export default function StudentCourseworkManager({ assignments }: Props) {
  const router = useRouter()
  const [files, setFiles] = useState<Record<string, File | null>>({})
  const [requestMessages, setRequestMessages] = useState<Record<string, string>>({})
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(assignmentId: string) {
    setSubmittingId(assignmentId)
    setMessage(null)
    setError(null)

    try {
      const file = files[assignmentId]
      const formData = new FormData()
      formData.append('assignmentId', assignmentId)
      if (file) {
        formData.append('file', file)
      }

      const response = await fetch('/api/coursework/submissions', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit coursework')
      }

      setMessage(data.message || 'Coursework submitted successfully.')
      setFiles((current) => ({
        ...current,
        [assignmentId]: null,
      }))
      router.refresh()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to submit coursework')
    } finally {
      setSubmittingId(null)
    }
  }

  async function handleAccessRequest(assignmentId: string) {
    setRequestingId(assignmentId)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch('/api/coursework/access-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assignmentId,
          message: requestMessages[assignmentId] ?? '',
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to request access')
      }

      setMessage(data.message || 'Access request sent successfully.')
      setRequestMessages((current) => ({
        ...current,
        [assignmentId]: '',
      }))
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to request access')
    } finally {
      setRequestingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Course Work and Report Submission</h1>
        <p className="mt-1 text-sm text-slate-500">
          Only your assigned coursework appears here. Upload DOCX only.
        </p>
      </div>

      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {assignments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center">
          <h2 className="text-xl font-semibold text-slate-900">No Coursework Assigned</h2>
          <p className="mt-2 text-sm text-slate-500">Your teacher has not assigned any coursework or report submission yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {assignments.map((assignment) => {
            const activeDeadline = getCourseworkActiveDeadline(
              assignment.submissionDeadline,
              assignment.latestAccessRequest?.canSubmitWithAccess &&
                !isCourseworkDeadlinePassed(assignment.latestAccessRequest.extensionDeadline)
                ? assignment.latestAccessRequest.extensionDeadline
                : null
            )
            const deadlinePassed = isCourseworkDeadlinePassed(activeDeadline)
            const requestPending = assignment.latestAccessRequest?.status === 'PENDING'
            const hasApprovedAccess = Boolean(assignment.latestAccessRequest?.canSubmitWithAccess)

            return (
              <section key={assignment.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                {deadlinePassed ? (
                  <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    Submission deadline passed on {formatCourseworkDeadline(activeDeadline)}.
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{assignment.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {assignment.subjectName} | {assignment.languageName} | {assignment.academicYearName} | {assignment.semesterName} | {assignment.groupName}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">Teacher: {assignment.teacherName}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {hasApprovedAccess
                        ? `Teacher access deadline: ${formatCourseworkDeadline(assignment.latestAccessRequest?.extensionDeadline ?? null)}`
                        : `Deadline: ${formatCourseworkDeadline(assignment.submissionDeadline)}`}
                    </p>
                  </div>
                  {assignment.latestSubmission ? (
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(assignment.latestSubmission.status)}`}>
                      {formatCourseworkStatus(assignment.latestSubmission.status)}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      Not submitted
                    </span>
                  )}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Rules</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{assignment.rules}</p>
                </div>

                {assignment.latestAccessRequest ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm font-semibold text-slate-900">Access Request</p>
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {formatCourseworkAccessRequestStatus(assignment.latestAccessRequest.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Requested on {new Date(assignment.latestAccessRequest.createdAt).toLocaleString()}
                    </p>
                    {assignment.latestAccessRequest.message ? (
                      <p className="mt-2 text-sm text-slate-700">{assignment.latestAccessRequest.message}</p>
                    ) : null}
                    {assignment.latestAccessRequest.teacherNote ? (
                      <p className="mt-2 text-sm text-slate-600">Teacher note: {assignment.latestAccessRequest.teacherNote}</p>
                    ) : null}
                    {assignment.latestAccessRequest.extensionDeadline ? (
                      <p className="mt-2 text-sm text-slate-600">
                        Access until {formatCourseworkDeadline(assignment.latestAccessRequest.extensionDeadline)}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {assignment.latestSubmission ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-900">Latest Submission</p>
                    <p className="mt-2 text-sm text-slate-600">
                      Submitted on {new Date(assignment.latestSubmission.createdAt).toLocaleDateString()} | {formatBytes(assignment.latestSubmission.fileSizeBytes)}
                    </p>
                    {assignment.latestSubmission.aiFeedback ? (
                      <p className="mt-2 text-sm text-rose-600">{assignment.latestSubmission.aiFeedback}</p>
                    ) : null}
                    <a
                      href={assignment.latestSubmission.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
                    >
                      Open latest DOCX
                    </a>
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1fr),auto] md:items-end">
                  <label className="block text-sm font-medium text-slate-700">
                    Upload DOCX
                    <input
                      type="file"
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(event) =>
                        setFiles((current) => ({
                          ...current,
                          [assignment.id]: event.target.files?.[0] ?? null,
                        }))
                      }
                      className="mt-2 block w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-sky-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-sky-700"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void handleSubmit(assignment.id)}
                    disabled={submittingId === assignment.id || deadlinePassed}
                    className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submittingId === assignment.id ? 'Submitting...' : 'Submit DOCX'}
                  </button>
                </div>

                {isCourseworkDeadlinePassed(assignment.submissionDeadline) && !hasApprovedAccess ? (
                  <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-800">Request Teacher Access</p>
                    <p className="mt-1 text-sm text-amber-700">
                      Deadline is over. Send a request to your teacher for temporary submission access.
                    </p>
                    <textarea
                      rows={3}
                      value={requestMessages[assignment.id] ?? ''}
                      onChange={(event) =>
                        setRequestMessages((current) => ({
                          ...current,
                          [assignment.id]: event.target.value,
                        }))
                      }
                      placeholder="Write why you need extra submission access"
                      className="mt-3 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-amber-400"
                    />
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handleAccessRequest(assignment.id)}
                        disabled={requestingId === assignment.id || requestPending}
                        className="rounded-2xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {requestingId === assignment.id ? 'Requesting...' : requestPending ? 'Request Pending' : 'Request Access'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
