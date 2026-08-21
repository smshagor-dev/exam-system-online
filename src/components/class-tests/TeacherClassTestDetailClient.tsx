'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CodeBlock } from '@/components/code/CodeEditor'
import RichTextContent from '@/components/editor/RichTextContent'
import { parseQuestionCodeMetadata } from '@/lib/question-code'

type SnapshotOption = { id: string; text: string; orderIndex: number; isCorrect: boolean }
type SnapshotQuestion = {
  sourceQuestionId: string
  orderIndex: number
  marks: number
  type: string
  text: string
  expectedAnswer: string | null
  explanation: string | null
  options: SnapshotOption[]
}
type Answer = {
  questionId: string
  selectedOption: string | null
  answerText: string | null
  marksAwarded: number | null
  teacherMarks: number | null
  teacherFeedback: string | null
  isCorrect: boolean | null
  reviewed: boolean
}
type Attempt = {
  id: string
  status: string
  startedAt: string
  submittedAt: string | null
  snapshot: SnapshotQuestion[]
  answers: Answer[]
  warningCount: number
  tabSwitchCount: number
  resultStatus: string
  marksObtained: number | null
  percentage: number | null
  isPassed: boolean | null
  student: { name: string; email: string }
}
type Makeup = {
  id: string
  classTestId: string
  studentId: string
  studentUserId: string
  studentEmail: string
  startTime: string
  endTime: string
  status: string
  student: { name: string; email: string }
}
type FoundStudent = {
  id: string
  userId: string
  name: string
  email: string
}
type Payload = {
  test: {
    id: string
    testNumber: number
    title: string
    duration: number
    totalMarks: number
    passingMarks: number
    startTime: string
    endTime: string
    lifecycle: string
    resultMode: string
    subject: { name: string; code: string } | null
  }
  attempts: Attempt[]
  makeups: Makeup[]
  maxWarnings: number
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function toDateTimeLocal(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}

export default function TeacherClassTestDetailClient({ classTestId }: { classTestId: string }) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { marks: number; feedback: string }>>({})
  const [studentEmail, setStudentEmail] = useState('')
  const [foundStudent, setFoundStudent] = useState<FoundStudent | null>(null)
  const [makeupStart, setMakeupStart] = useState('')
  const [makeupEnd, setMakeupEnd] = useState('')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/class-tests/${classTestId}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to load class test')
      setData(payload)
      const initial: Record<string, { marks: number; feedback: string }> = {}
      payload.attempts.forEach((attempt: Attempt) => {
        attempt.answers.forEach((answer) => {
          const question = attempt.snapshot.find((entry) => entry.sourceQuestionId === answer.questionId)
          if (!question) return
          initial[`${attempt.id}:${answer.questionId}`] = {
            marks: answer.teacherMarks ?? answer.marksAwarded ?? 0,
            feedback: answer.teacherFeedback ?? '',
          }
        })
      })
      setDrafts(initial)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Failed to load class test')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classTestId])

  const pendingCount = useMemo(
    () => data?.attempts.filter((attempt) => attempt.resultStatus === 'PENDING_REVIEW').length ?? 0,
    [data]
  )

  const searchMissedStudent = async () => {
    if (!studentEmail.trim()) return
    setSavingKey('search-missed')
    setError(null)
    setSuccess(null)
    setFoundStudent(null)
    try {
      const response = await fetch(`/api/class-tests/${classTestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search_missed_student', email: studentEmail.trim() }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Student is not eligible for reassignment')
      setFoundStudent(payload.student)
      if (payload.makeup) {
        setMakeupStart(toDateTimeLocal(payload.makeup.startTime))
        setMakeupEnd(toDateTimeLocal(payload.makeup.endTime))
      } else {
        const start = new Date(Date.now() + 5 * 60_000)
        const end = new Date(start.getTime() + (data?.test.duration ?? 15) * 60_000)
        setMakeupStart(toDateTimeLocal(start))
        setMakeupEnd(toDateTimeLocal(end))
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Student search failed')
    } finally {
      setSavingKey(null)
    }
  }

  const assignMissedStudent = async () => {
    if (!foundStudent || !makeupStart || !makeupEnd) return
    setSavingKey('assign-missed')
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/class-tests/${classTestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign_missed_student',
          email: foundStudent.email,
          startTime: new Date(makeupStart).toISOString(),
          endTime: new Date(makeupEnd).toISOString(),
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to assign missed class test')
      setSuccess(`${payload.student.name} (${payload.student.email}) can now take this class test only during the assigned window.`)
      setFoundStudent(null)
      setStudentEmail('')
      setMakeupStart('')
      setMakeupEnd('')
      await load()
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Failed to assign missed class test')
    } finally {
      setSavingKey(null)
    }
  }

  const saveReview = async (attemptId: string, questionId: string) => {
    const key = `${attemptId}:${questionId}`
    setSavingKey(key)
    setError(null)
    try {
      const draft = drafts[key] ?? { marks: 0, feedback: '' }
      const response = await fetch(`/api/class-tests/${classTestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'review_answer', attemptId, questionId, marks: draft.marks, feedback: draft.feedback }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to save review')
      await load()
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Failed to save review')
    } finally {
      setSavingKey(null)
    }
  }

  const publish = async (attemptId: string) => {
    setSavingKey(`publish:${attemptId}`)
    setError(null)
    try {
      const response = await fetch(`/api/class-tests/${classTestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish_result', attemptId }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to publish result')
      await load()
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Failed to publish result')
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">Loading class test...</div>
  if (!data) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error ?? 'Class test not found'}</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/teacher/class-tests" className="text-sm font-medium text-sky-700 hover:underline">← Class Tests</Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Test {data.test.testNumber} — {formatDate(data.test.startTime)}</h1>
          <p className="mt-1 text-sm text-gray-500">{data.test.subject?.name} · {data.test.duration} min · {data.test.totalMarks} marks · Pass {data.test.passingMarks}</p>
        </div>
        <div className="flex gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{data.test.lifecycle}</span>
          {pendingCount > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">{pendingCount} pending review</span>}
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Missed Student</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">Assign this class test to one student</h2>
            <p className="mt-1 text-sm text-gray-500">Search by exact student email. Only an eligible student who did not create any attempt can be assigned.</p>
          </div>
          {data.test.lifecycle !== 'CLOSED' && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Available after original test closes</span>}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={studentEmail}
            onChange={(event) => {
              setStudentEmail(event.target.value)
              setFoundStudent(null)
            }}
            disabled={data.test.lifecycle !== 'CLOSED'}
            placeholder="student@example.com"
            className="min-h-11 flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-sky-500 disabled:bg-gray-100"
          />
          <button
            type="button"
            onClick={searchMissedStudent}
            disabled={data.test.lifecycle !== 'CLOSED' || !studentEmail.trim() || savingKey === 'search-missed'}
            className="min-h-11 rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingKey === 'search-missed' ? 'Searching...' : 'Search Student'}
          </button>
        </div>

        {foundStudent && (
          <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-900">{foundStudent.name}</p>
                <p className="text-sm text-gray-600">{foundStudent.email}</p>
                <p className="mt-1 text-xs font-medium text-green-700">Eligible · Original class test missed · No attempt exists</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-700">Target student only</span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Reassigned Start</label>
                <input type="datetime-local" value={makeupStart} onChange={(event) => setMakeupStart(event.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Reassigned End</label>
                <input type="datetime-local" value={makeupEnd} onChange={(event) => setMakeupEnd(event.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm" />
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">The student can start only inside this window. Their actual attempt still cannot exceed the original {data.test.duration}-minute duration.</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={assignMissedStudent}
                disabled={!makeupStart || !makeupEnd || savingKey === 'assign-missed'}
                className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {savingKey === 'assign-missed' ? 'Assigning...' : 'Assign / Update Window'}
              </button>
            </div>
          </div>
        )}

        {data.makeups.length > 0 && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="mb-3 text-sm font-semibold text-gray-900">Individually reassigned students</p>
            <div className="space-y-2">
              {data.makeups.map((makeup) => {
                const hasAttempt = data.attempts.some((attempt) => attempt.student.email === makeup.student.email)
                return (
                  <div key={makeup.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{makeup.student.name}</p>
                      <p className="text-xs text-gray-500">{makeup.student.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-gray-700">{formatDate(makeup.startTime)} → {formatDate(makeup.endTime)}</p>
                      <p className={`mt-1 text-xs font-semibold ${hasAttempt ? 'text-green-700' : 'text-sky-700'}`}>{hasAttempt ? 'Attempt started' : 'Waiting for student'}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {data.attempts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">No student has started this class test yet.</div>
      ) : (
        <div className="space-y-5">
          {data.attempts.map((attempt) => (
            <section key={attempt.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 p-5">
                <div>
                  <h2 className="font-semibold text-gray-900">{attempt.student.name}</h2>
                  <p className="text-sm text-gray-500">{attempt.student.email}</p>
                  <p className="mt-1 text-xs text-gray-400">Started {formatDate(attempt.startedAt)}{attempt.submittedAt ? ` · Submitted ${formatDate(attempt.submittedAt)}` : ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-gray-900">{attempt.marksObtained ?? 0}/{data.test.totalMarks}</p>
                  <p className="text-xs text-gray-500">Warnings {attempt.warningCount}/{data.maxWarnings} · Tab switches {attempt.tabSwitchCount}</p>
                  <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${attempt.resultStatus === 'PUBLISHED' ? 'bg-green-100 text-green-700' : attempt.resultStatus === 'PENDING_REVIEW' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>{attempt.resultStatus.replaceAll('_', ' ')}</span>
                </div>
              </div>

              <div className="space-y-4 p-5">
                {attempt.snapshot.map((question, index) => {
                  const answer = attempt.answers.find((entry) => entry.questionId === question.sourceQuestionId)
                  const parsed = parseQuestionCodeMetadata(question.text)
                  const key = `${attempt.id}:${question.sourceQuestionId}`
                  const draft = drafts[key] ?? { marks: answer?.teacherMarks ?? answer?.marksAwarded ?? 0, feedback: answer?.teacherFeedback ?? '' }
                  const manual = !answer?.reviewed || question.type === 'WRITTEN_ANSWER' || (question.type === 'SHORT_ANSWER' && !question.expectedAnswer)
                  return (
                    <div key={question.sourceQuestionId} className="rounded-xl border border-gray-200 p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-gray-600">Q{index + 1}</span><span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">{question.type.replaceAll('_', ' ')}</span><span className="text-gray-500">Max {question.marks}</span>{parsed.metadata.answerMode === 'CODE' && <span className="rounded bg-sky-100 px-2 py-0.5 text-sky-700">CODE ANSWER</span>}</div>
                      <RichTextContent html={parsed.text} className="rich-text-content text-gray-900" />
                      {parsed.metadata.contentMode === 'TEXT_CODE' && parsed.metadata.codeContent && <div className="mt-3"><CodeBlock code={parsed.metadata.codeContent} language={parsed.metadata.codeLanguage} label="Question Code" /></div>}

                      <div className="mt-4 rounded-xl bg-gray-50 p-3">
                        <p className="mb-2 text-xs font-semibold text-gray-600">Student Answer</p>
                        {(question.type === 'MCQ' || question.type === 'TRUE_FALSE') ? (
                          <div className="space-y-1.5">{question.options.map((option) => <div key={option.id} className={`rounded-lg px-3 py-2 text-sm ${option.id === answer?.selectedOption ? option.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700' : option.isCorrect ? 'bg-green-50 text-green-700' : 'bg-white text-gray-600'}`}>{option.text}{option.id === answer?.selectedOption ? ' · selected' : ''}{option.isCorrect ? ' · correct' : ''}</div>)}</div>
                        ) : parsed.metadata.answerMode === 'CODE' && answer?.answerText ? (
                          <CodeBlock code={answer.answerText} language={parsed.metadata.answerCodeLanguage} label="Student Code" />
                        ) : (
                          <p className="whitespace-pre-wrap text-sm text-gray-900">{answer?.answerText || <span className="italic text-gray-400">No answer</span>}</p>
                        )}
                      </div>

                      {manual && attempt.status !== 'IN_PROGRESS' && attempt.resultStatus !== 'PUBLISHED' && (
                        <div className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_auto] md:items-end">
                          <div><label className="mb-1 block text-xs font-medium text-gray-700">Marks</label><input type="number" min={0} max={question.marks} step={0.5} value={draft.marks} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draft, marks: Number(event.target.value) } }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></div>
                          <div><label className="mb-1 block text-xs font-medium text-gray-700">Feedback</label><input value={draft.feedback} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draft, feedback: event.target.value } }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Optional feedback" /></div>
                          <button onClick={() => saveReview(attempt.id, question.sourceQuestionId)} disabled={savingKey === key} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{savingKey === key ? 'Saving...' : 'Save Review'}</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {attempt.status !== 'IN_PROGRESS' && attempt.resultStatus !== 'PUBLISHED' && (
                <div className="flex justify-end border-t border-gray-100 p-5"><button onClick={() => publish(attempt.id)} disabled={savingKey === `publish:${attempt.id}`} className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">{savingKey === `publish:${attempt.id}` ? 'Publishing...' : 'Publish Student Result'}</button></div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
