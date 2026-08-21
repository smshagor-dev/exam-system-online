'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseQuestionCodeMetadata } from '@/lib/question-code'

export type ClassTestAssignmentOption = {
  id: string
  departmentId: string
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
  academicOfferingId: string | null
}

type QuestionRow = {
  id: string
  text: string
  type: string
  marks: number
  isActive: boolean
  languageId: string
}

function toInputDate(date: Date) {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

export default function ClassTestCreateForm({ assignments }: { assignments: ClassTestAssignmentOption[] }) {
  const router = useRouter()
  const initialStart = new Date(Date.now() + 15 * 60_000)
  const initialEnd = new Date(initialStart.getTime() + 30 * 60_000)
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [duration, setDuration] = useState(15)
  const [startTime, setStartTime] = useState(toInputDate(initialStart))
  const [endTime, setEndTime] = useState(toInputDate(initialEnd))
  const [resultMode, setResultMode] = useState<'AUTO' | 'TEACHER_REVIEW'>('AUTO')
  const [questionsPerStudent, setQuestionsPerStudent] = useState(5)
  const [marksPerQuestion, setMarksPerQuestion] = useState(2)
  const [passingMarks, setPassingMarks] = useState(5)
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assignment = assignments.find((entry) => entry.id === assignmentId) ?? null
  const totalMarks = questionsPerStudent * marksPerQuestion

  useEffect(() => {
    if (!assignment) {
      setQuestions([])
      setSelectedIds([])
      return
    }
    let cancelled = false
    setLoadingQuestions(true)
    setError(null)
    const query = new URLSearchParams({
      subjectId: assignment.subjectId,
      groupId: assignment.groupId,
      academicYearId: assignment.academicYearId,
      semesterId: assignment.semesterId,
    })
    fetch(`/api/questions?${query.toString()}`)
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Failed to load questions')
        return data as QuestionRow[]
      })
      .then((data) => {
        if (cancelled) return
        const published = data.filter((question) => question.isActive && question.languageId === assignment.languageId)
        setQuestions(published)
        setSelectedIds(published.map((question) => question.id))
        setQuestionsPerStudent((current) => Math.max(1, Math.min(current, published.length || 1)))
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Failed to load questions')
      })
      .finally(() => {
        if (!cancelled) setLoadingQuestions(false)
      })
    return () => {
      cancelled = true
    }
  }, [assignment])

  useEffect(() => {
    if (passingMarks > totalMarks) setPassingMarks(totalMarks)
  }, [passingMarks, totalMarks])

  const selectedQuestions = useMemo(
    () => questions.filter((question) => selectedIds.includes(question.id)),
    [questions, selectedIds]
  )

  const toggleQuestion = (questionId: string) => {
    setSelectedIds((current) =>
      current.includes(questionId) ? current.filter((id) => id !== questionId) : [...current, questionId]
    )
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!assignment) return
    if (selectedIds.length === 0) {
      setError('Select at least one published question')
      return
    }
    if (questionsPerStudent > selectedIds.length) {
      setError('Questions per student cannot exceed the selected question pool')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/class-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          departmentId: assignment.departmentId,
          subjectId: assignment.subjectId,
          languageId: assignment.languageId,
          groupId: assignment.groupId,
          academicYearId: assignment.academicYearId,
          semesterId: assignment.semesterId,
          academicOfferingId: assignment.academicOfferingId,
          title: title.trim() || null,
          instructions: instructions.trim() || null,
          duration,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          resultMode,
          questionsPerStudent,
          marksPerQuestion,
          passingMarks,
          questionIds: selectedIds,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to create class test')
      router.push(`/teacher/class-tests/${data.id}`)
      router.refresh()
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Failed to create class test')
    } finally {
      setSaving(false)
    }
  }

  if (assignments.length === 0) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">No teaching assignment is available for creating a class test.</div>
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Class Test Setup</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Teaching Scope</label>
            <select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500">
              {assignments.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.subjectName} | {entry.groupName} | {entry.academicYearName} | {entry.semesterName} | {entry.languageName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Optional Title</label>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Defaults to Test 1, Test 2..." className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Result Mode</label>
            <select value={resultMode} onChange={(event) => setResultMode(event.target.value as 'AUTO' | 'TEACHER_REVIEW')} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500">
              <option value="AUTO">Auto where possible</option>
              <option value="TEACHER_REVIEW">Teacher review before publish</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Starts At</label>
            <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} required className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Available Until</label>
            <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} required className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Duration (minutes)</label>
            <input type="number" min={1} max={180} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Passing Marks</label>
            <input type="number" min={0} max={totalMarks} value={passingMarks} onChange={(event) => setPassingMarks(Number(event.target.value))} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Instructions</label>
            <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={3} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500" placeholder="Optional instructions shown before the test starts" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Question Pool</h2>
            <p className="mt-1 text-sm text-gray-500">Each student gets a randomized subset. Their first-start snapshot is locked for refresh/reconnect recovery.</p>
          </div>
          <div className="rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-800">Pool: {selectedIds.length} · Per student: {questionsPerStudent} · Total: {totalMarks}</div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Questions per student</label>
            <input type="number" min={1} max={Math.max(1, selectedIds.length)} value={questionsPerStudent} onChange={(event) => setQuestionsPerStudent(Number(event.target.value))} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Marks per question</label>
            <input type="number" min={1} max={100} value={marksPerQuestion} onChange={(event) => setMarksPerQuestion(Number(event.target.value))} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm" />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => setSelectedIds(selectedIds.length === questions.length ? [] : questions.map((question) => question.id))} className="w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm font-medium text-sky-700 hover:bg-sky-100">
              {selectedIds.length === questions.length ? 'Clear All' : 'Select All'}
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {loadingQuestions ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">Loading published questions...</div>
          ) : questions.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">No published questions are available in this scope. Publish Question Bank items first.</div>
          ) : (
            questions.map((question, index) => {
              const parsedQuestion = parseQuestionCodeMetadata(question.text)
              return (
                <label key={question.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${selectedIds.includes(question.id) ? 'border-sky-300 bg-sky-50/60' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="checkbox" checked={selectedIds.includes(question.id)} onChange={() => toggleQuestion(question.id)} className="mt-1 h-4 w-4 rounded text-sky-600" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500"><span>Q{index + 1}</span><span className="rounded bg-gray-100 px-2 py-0.5">{question.type.replaceAll('_', ' ')}</span>{parsedQuestion.metadata.contentMode === 'TEXT_CODE' && <span className="rounded bg-slate-800 px-2 py-0.5 text-white">CODE</span>}</div>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-900">{stripHtml(parsedQuestion.text)}</p>
                  </div>
                </label>
              )
            })
          )}
        </div>
      </section>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => router.push('/teacher/class-tests')} className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700">Cancel</button>
        <button type="submit" disabled={saving || loadingQuestions || selectedQuestions.length === 0} className="rounded-xl bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{saving ? 'Creating...' : 'Create Class Test'}</button>
      </div>
    </form>
  )
}
