'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Save, Send } from 'lucide-react'

type Props = {
  exam: {
    id: string
    title: string
    description: string | null
    duration: number
    totalMarks: number
    passingMarks: number
    startTime: string
    endTime: string
    instructions: string | null
    status: string
    autoPublish: boolean
    showAnswers: boolean
    showMarks: boolean
    questionCount: number
    subjectName: string
    groupName: string
  }
  studentName: string
  studentEmail: string
  type: string
  reason: string
}

function toLocalInput(iso: string) {
  const date = new Date(iso)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export default function ReExamSetupForm({ exam, studentName, studentEmail, type, reason }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState(exam.title)
  const [description, setDescription] = useState(exam.description ?? '')
  const [duration, setDuration] = useState(exam.duration)
  const [totalMarks, setTotalMarks] = useState(exam.totalMarks)
  const [passingMarks, setPassingMarks] = useState(exam.passingMarks)
  const [startTime, setStartTime] = useState(toLocalInput(exam.startTime))
  const [endTime, setEndTime] = useState(toLocalInput(exam.endTime))
  const [instructions, setInstructions] = useState(exam.instructions ?? '')
  const [autoPublish, setAutoPublish] = useState(exam.autoPublish)
  const [showAnswers, setShowAnswers] = useState(exam.showAnswers)
  const [showMarks, setShowMarks] = useState(exam.showMarks)
  const [working, setWorking] = useState<'save' | 'schedule' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save(status?: 'SCHEDULED') {
    setWorking(status ? 'schedule' : 'save')
    setMessage(null)
    setError(null)

    try {
      const start = new Date(startTime)
      const end = new Date(endTime)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error('Please provide a valid start and end time')
      }
      if (end <= start) throw new Error('End time must be after start time')
      if (duration < 1) throw new Error('Duration must be at least 1 minute')
      if (totalMarks < 1) throw new Error('Total marks must be at least 1')
      if (passingMarks < 0 || passingMarks > totalMarks) {
        throw new Error('Passing marks must be between 0 and total marks')
      }

      const response = await fetch(`/api/exams/${exam.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          duration,
          totalMarks,
          passingMarks,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          instructions: instructions.trim() || null,
          autoPublish,
          showAnswers,
          showMarks,
          ...(status ? { status } : {}),
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Could not save re-exam setup')
      }

      setMessage(status ? 'Re-exam scheduled. Only the assigned student will be able to access it.' : 'Draft saved successfully.')
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save re-exam')
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-sky-100 bg-gradient-to-br from-white to-sky-50 p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
              <CalendarClock className="h-3.5 w-3.5" />
              {type.replaceAll('_', ' ')} SETUP
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">Configure Re-exam</h1>
            <p className="mt-2 text-sm text-slate-600">
              Assigned to <span className="font-semibold text-slate-900">{studentName}</span> ({studentEmail})
            </p>
            <p className="mt-1 text-sm text-slate-500">{exam.subjectName} · {exam.groupName} · {exam.questionCount} cloned questions</p>
          </div>
          <span className="w-fit rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">{exam.status}</span>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Request / enable reason</p>
          <p className="mt-1 whitespace-pre-wrap">{reason}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block lg:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
          </label>

          <label className="block lg:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Start time</span>
            <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">End time</span>
            <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Duration (minutes)</span>
            <input type="number" min={1} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Total marks</span>
              <input type="number" min={1} value={totalMarks} onChange={(event) => setTotalMarks(Number(event.target.value))} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Passing</span>
              <input type="number" min={0} value={passingMarks} onChange={(event) => setPassingMarks(Number(event.target.value))} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
            </label>
          </div>

          <label className="block lg:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Instructions</span>
            <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={4} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
          </label>

          <div className="lg:col-span-2 grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={autoPublish} onChange={(event) => setAutoPublish(event.target.checked)} /> Auto-publish result
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={showAnswers} onChange={(event) => setShowAnswers(event.target.checked)} /> Show correct answers
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={showMarks} onChange={(event) => setShowMarks(event.target.checked)} /> Show marks
            </label>
          </div>
        </div>

        {error && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {message && <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => save()} disabled={working !== null} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Save className="h-4 w-4" />
            {working === 'save' ? 'Saving...' : 'Save draft'}
          </button>
          <button type="button" onClick={() => save('SCHEDULED')} disabled={working !== null || exam.status === 'LIVE' || exam.status === 'COMPLETED' || exam.status === 'RESULT_PUBLISHED'} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
            <Send className="h-4 w-4" />
            {working === 'schedule' ? 'Scheduling...' : 'Schedule & publish to student'}
          </button>
        </div>
      </section>
    </div>
  )
}
