'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { CodeBlock, CodeEditor } from '@/components/code/CodeEditor'
import RichTextContent from '@/components/editor/RichTextContent'
import { parseQuestionCodeMetadata } from '@/lib/question-code'

type TestData = {
  id: string
  testNumber: number
  title: string
  instructions: string | null
  duration: number
  totalMarks: number
  passingMarks: number
  startTime: string
  endTime: string
  questionsPerStudent: number
  lifecycle: 'UPCOMING' | 'LIVE' | 'CLOSED' | 'CANCELLED'
  subject: { name: string; code: string } | null
}
type SnapshotQuestion = {
  sourceQuestionId: string
  orderIndex: number
  marks: number
  type: string
  text: string
  options: Array<{ id: string; text: string; orderIndex: number }>
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
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED'
  snapshot: SnapshotQuestion[]
  answers: Answer[]
  warningCount: number
  resultStatus: 'NOT_READY' | 'PENDING_REVIEW' | 'PUBLISHED'
  marksObtained: number | null
  percentage: number | null
  isPassed: boolean | null
  remainingSeconds: number
  maxWarnings: number
}
type Payload = { test: TestData; attempt: Attempt | null }
type LocalAnswer = { selectedOption?: string; answerText?: string }
type QueueItem = { questionId: string; selectedOption?: string; answerText?: string; savedAt: number }
type WarningType = 'TAB_SWITCH' | 'COPY' | 'SCREENSHOT' | 'DEVTOOLS'

function storageKey(classTestId: string) {
  return `class-test-queue:${classTestId}`
}

function readQueue(classTestId: string): QueueItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(storageKey(classTestId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatTime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export default function StudentClassTestClient({ classTestId }: { classTestId: string }) {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({})
  const [remaining, setRemaining] = useState(0)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState<'online' | 'offline' | 'syncing'>('online')
  const [showSubmit, setShowSubmit] = useState(false)
  const queueRef = useRef<QueueItem[]>([])
  const flushingRef = useRef(false)
  const devtoolsRef = useRef(false)
  const attemptRef = useRef<Attempt | null>(null)

  const persistQueue = useCallback((queue: QueueItem[]) => {
    queueRef.current = queue
    if (queue.length === 0) sessionStorage.removeItem(storageKey(classTestId))
    else sessionStorage.setItem(storageKey(classTestId), JSON.stringify(queue))
  }, [classTestId])

  const applyPayload = useCallback((next: Payload) => {
    const queued = readQueue(classTestId)
    queueRef.current = queued
    const serverAnswers: Record<string, LocalAnswer> = {}
    for (const answer of next.attempt?.answers ?? []) {
      serverAnswers[answer.questionId] = {
        selectedOption: answer.selectedOption ?? undefined,
        answerText: answer.answerText ?? undefined,
      }
    }
    for (const item of queued) {
      serverAnswers[item.questionId] = { selectedOption: item.selectedOption, answerText: item.answerText }
    }
    setAnswers(serverAnswers)
    setPayload(next)
    attemptRef.current = next.attempt
    setRemaining(next.attempt?.remainingSeconds ?? 0)
  }, [classTestId])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const response = await fetch(`/api/class-tests/${classTestId}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to load class test')
      applyPayload(data)
      setConnection('online')
      setError(null)
    } catch (reason: unknown) {
      setConnection('offline')
      if (!silent) setError(reason instanceof Error ? reason.message : 'Failed to load class test')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [applyPayload, classTestId])

  useEffect(() => {
    void load()
  }, [load])

  const flushQueue = useCallback(async () => {
    const attempt = attemptRef.current
    if (!attempt || attempt.status !== 'IN_PROGRESS' || flushingRef.current || queueRef.current.length === 0) return
    flushingRef.current = true
    setConnection('syncing')
    try {
      while (queueRef.current.length > 0) {
        const item = queueRef.current[0]
        const response = await fetch(`/api/class-tests/${classTestId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save_answer', attemptId: attempt.id, questionId: item.questionId, selectedOption: item.selectedOption ?? null, answerText: item.answerText ?? null }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Autosave failed')
        persistQueue(queueRef.current.slice(1))
        if (data.attempt) {
          attemptRef.current = data.attempt
          setPayload((current) => current ? { ...current, attempt: data.attempt } : current)
          setRemaining(data.attempt.remainingSeconds ?? 0)
          if (data.attempt.status !== 'IN_PROGRESS') break
        }
      }
      setConnection('online')
    } catch {
      setConnection('offline')
    } finally {
      flushingRef.current = false
    }
  }, [classTestId, persistQueue])

  useEffect(() => {
    if (payload?.attempt?.status !== 'IN_PROGRESS') return
    const autosave = window.setInterval(() => void flushQueue(), 5000)
    const sync = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/class-tests/${classTestId}`, { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) return
        if (data.attempt) {
          attemptRef.current = data.attempt
          setPayload((current) => current ? { ...current, test: data.test, attempt: data.attempt } : data)
          setRemaining(data.attempt.remainingSeconds ?? 0)
        }
        setConnection('online')
        void flushQueue()
      } catch {
        setConnection('offline')
      }
    }, 10000)
    return () => {
      clearInterval(autosave)
      clearInterval(sync)
    }
  }, [classTestId, flushQueue, payload?.attempt?.status])

  const submitAttempt = useCallback(async (automatic = false) => {
    const attempt = attemptRef.current
    if (!attempt || attempt.status !== 'IN_PROGRESS' || submitting) return
    setSubmitting(true)
    try {
      await flushQueue()
      const response = await fetch(`/api/class-tests/${classTestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: automatic ? 'auto_submit' : 'submit', attemptId: attempt.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to submit class test')
      persistQueue([])
      attemptRef.current = data.attempt
      setPayload((current) => current ? { ...current, attempt: data.attempt } : current)
      setRemaining(0)
      setShowSubmit(false)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Failed to submit class test')
    } finally {
      setSubmitting(false)
    }
  }, [classTestId, flushQueue, persistQueue, submitting])

  useEffect(() => {
    if (payload?.attempt?.status !== 'IN_PROGRESS') return
    const timer = window.setInterval(() => {
      setRemaining((current) => {
        const next = Math.max(0, current - 1)
        if (next === 0 && current > 0) window.setTimeout(() => void submitAttempt(true), 0)
        return next
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [payload?.attempt?.status, submitAttempt])

  const reportWarning = useCallback(async (type: WarningType) => {
    const attempt = attemptRef.current
    if (!attempt || attempt.status !== 'IN_PROGRESS') return
    try {
      const response = await fetch(`/api/class-tests/${classTestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'warning', attemptId: attempt.id, type }),
      })
      const data = await response.json()
      if (!response.ok) return
      attemptRef.current = data.attempt
      setPayload((current) => current ? { ...current, attempt: data.attempt } : current)
      setRemaining(data.attempt.remainingSeconds ?? remaining)
    } catch {
      setConnection('offline')
    }
  }, [classTestId, remaining])

  useEffect(() => {
    if (payload?.attempt?.status !== 'IN_PROGRESS') return
    const visibility = () => {
      if (document.hidden) void reportWarning('TAB_SWITCH')
    }
    const clipboard = (event: ClipboardEvent) => {
      event.preventDefault()
      void reportWarning('COPY')
    }
    const keys = (event: KeyboardEvent) => {
      const screenshot = event.key === 'PrintScreen' || (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 's') || (event.metaKey && event.shiftKey && ['3', '4', '5'].includes(event.key))
      if (screenshot) void reportWarning('SCREENSHOT')
    }
    const detectDevtools = () => {
      const open = window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160
      if (open && !devtoolsRef.current) {
        devtoolsRef.current = true
        void reportWarning('DEVTOOLS')
      }
      if (!open) devtoolsRef.current = false
    }
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('copy', clipboard)
    document.addEventListener('cut', clipboard)
    document.addEventListener('paste', clipboard)
    window.addEventListener('keydown', keys)
    const interval = window.setInterval(detectDevtools, 1500)
    detectDevtools()
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      document.removeEventListener('copy', clipboard)
      document.removeEventListener('cut', clipboard)
      document.removeEventListener('paste', clipboard)
      window.removeEventListener('keydown', keys)
      clearInterval(interval)
      devtoolsRef.current = false
    }
  }, [payload?.attempt?.status, reportWarning])

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      const response = await fetch(`/api/class-tests/${classTestId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start' }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to start class test')
      const next = { test: payload!.test, attempt: data.attempt }
      applyPayload(next)
      setConnection('online')
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Failed to start class test')
    } finally {
      setStarting(false)
    }
  }

  const setAnswer = (questionId: string, next: LocalAnswer) => {
    setAnswers((current) => ({ ...current, [questionId]: next }))
    const queue = [...queueRef.current.filter((item) => item.questionId !== questionId), { questionId, ...next, savedAt: Date.now() }]
    persistQueue(queue)
  }

  const answeredCount = useMemo(() => payload?.attempt?.snapshot.filter((question) => {
    const answer = answers[question.sourceQuestionId]
    return Boolean(answer?.selectedOption || answer?.answerText?.trim())
  }).length ?? 0, [answers, payload?.attempt?.snapshot])

  if (loading) return <div className="py-20 text-center text-gray-400">Loading class test...</div>
  if (!payload) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error ?? 'Class test not found'}</div>
  const { test, attempt } = payload

  if (attempt && attempt.status !== 'IN_PROGRESS') {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href="/student/class-tests" className="text-sm font-medium text-violet-700 hover:underline">← Class Tests</Link>
        <div className={`rounded-2xl border p-6 ${attempt.resultStatus === 'PUBLISHED' ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Test {test.testNumber} · {test.subject?.name}</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Class Test Submitted</h1>
          {attempt.resultStatus === 'PUBLISHED' ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white p-4"><p className="text-xs text-gray-500">Marks</p><p className="mt-1 text-2xl font-bold text-gray-900">{attempt.marksObtained}/{test.totalMarks}</p></div>
              <div className="rounded-xl bg-white p-4"><p className="text-xs text-gray-500">Percentage</p><p className="mt-1 text-2xl font-bold text-gray-900">{(attempt.percentage ?? 0).toFixed(1)}%</p></div>
              <div className="rounded-xl bg-white p-4"><p className="text-xs text-gray-500">Result</p><p className={`mt-1 text-2xl font-bold ${attempt.isPassed ? 'text-green-700' : 'text-red-700'}`}>{attempt.isPassed ? 'PASS' : 'FAIL'}</p></div>
            </div>
          ) : <p className="mt-3 text-sm text-amber-800">Your answers were submitted successfully. Written/code answers are waiting for teacher review.</p>}
          <p className="mt-4 text-xs text-gray-500">Security warnings recorded: {attempt.warningCount}/{attempt.maxWarnings}</p>
        </div>

        {attempt.resultStatus === 'PUBLISHED' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-900">Answer Review</h2>
            {attempt.snapshot.map((question, index) => {
              const answer = attempt.answers.find((entry) => entry.questionId === question.sourceQuestionId)
              const parsed = parseQuestionCodeMetadata(question.text)
              return (
                <div key={question.sourceQuestionId} className="rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold text-gray-600">Question {index + 1}</span><span className="text-sm font-bold text-gray-900">{answer?.teacherMarks ?? answer?.marksAwarded ?? 0}/{question.marks}</span></div>
                  <RichTextContent html={parsed.text} className="rich-text-content text-gray-900" />
                  {parsed.metadata.contentMode === 'TEXT_CODE' && parsed.metadata.codeContent && <div className="mt-3"><CodeBlock code={parsed.metadata.codeContent} language={parsed.metadata.codeLanguage} label="Question Code" /></div>}
                  <div className="mt-4 rounded-xl bg-gray-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-gray-500">Your Answer</p>
                    {parsed.metadata.answerMode === 'CODE' && answer?.answerText ? <CodeBlock code={answer.answerText} language={parsed.metadata.answerCodeLanguage} label="Your Code" /> : <p className="whitespace-pre-wrap text-sm text-gray-900">{answer?.answerText || answer?.selectedOption || 'No answer'}</p>}
                  </div>
                  {answer?.teacherFeedback && <div className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-800"><span className="font-semibold">Teacher feedback:</span> {answer.teacherFeedback}</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (!attempt) {
    const canStart = test.lifecycle === 'LIVE'
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <Link href="/student/class-tests" className="text-sm font-medium text-violet-700 hover:underline">← Class Tests</Link>
        <div className="rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">{test.subject?.code ?? 'CLASS TEST'}</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Test {test.testNumber} — {formatDate(test.startTime)}</h1>
          {test.title !== `Test ${test.testNumber}` && <p className="mt-1 text-gray-600">{test.title}</p>}
          <div className="mt-5 grid grid-cols-3 gap-3 text-center"><div className="rounded-xl bg-gray-50 p-3"><p className="text-xl font-bold">{test.duration}</p><p className="text-xs text-gray-500">Minutes</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xl font-bold">{test.questionsPerStudent}</p><p className="text-xs text-gray-500">Questions</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xl font-bold">{test.totalMarks}</p><p className="text-xs text-gray-500">Marks</p></div></div>
          <div className="mt-4 rounded-xl bg-violet-50 p-4 text-sm text-violet-900"><p><strong>Available:</strong> {formatDate(test.startTime)} → {formatDate(test.endTime)}</p><p className="mt-1">You can start only inside this window. If you start late, the scheduled closing time still applies.</p></div>
          {test.instructions && <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap">{test.instructions}</div>}
          {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <button onClick={start} disabled={!canStart || starting} className="mt-5 w-full rounded-xl bg-violet-600 py-3 font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-gray-300">{starting ? 'Starting...' : canStart ? 'Start Class Test' : test.lifecycle === 'UPCOMING' ? 'Not Started Yet' : 'Class Test Closed'}</button>
        </div>
      </div>
    )
  }

  const critical = remaining < 60
  const warning = remaining < 300
  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-16">
      <div className="sticky top-2 z-30 flex items-center justify-between rounded-xl border border-gray-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div><p className="font-semibold text-gray-900">Test {test.testNumber} · {test.subject?.name}</p><p className="text-xs text-gray-500">{answeredCount}/{attempt.snapshot.length} answered · {connection === 'online' ? 'Saved' : connection === 'syncing' ? 'Syncing answers...' : 'Offline — answers queued locally'}</p></div>
        <div className={`rounded-xl px-4 py-2 font-mono text-xl font-bold ${critical ? 'animate-pulse bg-red-100 text-red-600' : warning ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-900'}`}>{formatTime(remaining)}</div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {attempt.warningCount > 0 && <div className={`rounded-xl border p-3 text-sm ${attempt.warningCount >= attempt.maxWarnings ? 'border-red-200 bg-red-50 text-red-700' : 'border-orange-200 bg-orange-50 text-orange-700'}`}><strong>Warning {attempt.warningCount}/{attempt.maxWarnings}</strong> — security violations are logged. Reaching the limit auto-submits the class test.</div>}
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200"><div className="h-full bg-violet-600 transition-all" style={{ width: `${attempt.snapshot.length ? (answeredCount / attempt.snapshot.length) * 100 : 0}%` }} /></div>

      <div className="space-y-5">
        {attempt.snapshot.map((question, index) => {
          const answer = answers[question.sourceQuestionId] ?? {}
          const parsed = parseQuestionCodeMetadata(question.text)
          return (
            <section key={question.sourceQuestionId} className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between"><span className="text-sm font-semibold text-gray-600">Question {index + 1} of {attempt.snapshot.length}</span><span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">{question.marks} marks</span></div>
              <RichTextContent html={parsed.text} className="rich-text-content font-medium text-gray-900" />
              {parsed.metadata.contentMode === 'TEXT_CODE' && parsed.metadata.codeContent && <div className="mt-4"><CodeBlock code={parsed.metadata.codeContent} language={parsed.metadata.codeLanguage} label="Question Code" /></div>}

              {(question.type === 'MCQ' || question.type === 'TRUE_FALSE') && <div className="mt-5 space-y-2">{question.options.map((option) => <label key={option.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 ${answer.selectedOption === option.id ? 'border-violet-500 bg-violet-50' : 'border-gray-200'}`}><input type="radio" name={`q-${question.sourceQuestionId}`} checked={answer.selectedOption === option.id} onChange={() => setAnswer(question.sourceQuestionId, { selectedOption: option.id })} className="h-4 w-4 text-violet-600" /><span className="text-sm text-gray-900">{option.text}</span></label>)}</div>}

              {question.type === 'SHORT_ANSWER' && parsed.metadata.answerMode !== 'CODE' && <input value={answer.answerText ?? ''} onChange={(event) => setAnswer(question.sourceQuestionId, { answerText: event.target.value })} className="mt-5 w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm outline-none focus:border-violet-500" placeholder="Type your answer..." />}

              {(question.type === 'WRITTEN_ANSWER' || parsed.metadata.answerMode === 'CODE') && (parsed.metadata.answerMode === 'CODE' ? <div className="mt-5"><CodeEditor value={answer.answerText ?? parsed.metadata.starterCode ?? ''} onChange={(value) => setAnswer(question.sourceQuestionId, { answerText: value })} language={parsed.metadata.answerCodeLanguage} label="Your Code Answer" minHeight={320} /></div> : <textarea value={answer.answerText ?? ''} onChange={(event) => setAnswer(question.sourceQuestionId, { answerText: event.target.value })} className="mt-5 w-full resize-y rounded-xl border-2 border-gray-200 px-4 py-3 text-sm outline-none focus:border-violet-500" rows={7} placeholder="Write your answer..." />)}
            </section>
          )
        })}
      </div>

      <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur"><div><p className="text-sm font-semibold text-gray-900">{answeredCount} of {attempt.snapshot.length} answered</p><p className="text-xs text-gray-500">Review all answers before final submission.</p></div><button onClick={() => setShowSubmit(true)} className="rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-700">Stop and Submit</button></div>

      {showSubmit && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-sm rounded-2xl bg-white p-6"><h3 className="text-lg font-bold text-gray-900">Submit Class Test?</h3><p className="mt-2 text-sm text-gray-500">Answered {answeredCount} of {attempt.snapshot.length}. This action cannot be undone.</p><div className="mt-6 flex gap-3"><button onClick={() => setShowSubmit(false)} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm">Review</button><button onClick={() => void submitAttempt(false)} disabled={submitting} className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{submitting ? 'Submitting...' : 'Submit'}</button></div></div></div>}
    </div>
  )
}
