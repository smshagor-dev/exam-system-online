'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { getSocket, type AppSocket } from '@/lib/socket'
import RichTextContent from '@/components/editor/RichTextContent'

type Question = {
  id: string
  examQuestionId: string
  text: string
  type: string
  marks: number
  options: { id: string; text: string }[]
  orderIndex: number
}

type ExamQuestionPayload = {
  id: string
  marks: number
  orderIndex: number
  question: {
    id: string
    text: string
    type: string
    options: { id: string; text: string }[]
  }
}

type ExamData = {
  title: string
  duration: number
  totalMarks: number
  instructions?: string | null
  subject?: { name: string } | null
  questions: ExamQuestionPayload[]
}

type AnswerState = Record<string, { selectedOption?: string; answerText?: string }>
type AttemptStatus = 'loading' | 'ready' | 'started' | 'submitted' | 'error'
type WarningType = 'TAB_SWITCH' | 'COPY' | 'SCREENSHOT' | 'DEVTOOLS'
type Props = { params: Promise<{ id: string }> }

export default function ExamAttemptPage({ params }: Props) {
  const { data: session } = useSession()
  const router = useRouter()
  const { id: examId } = use(params)
  const socketRef = useRef<AppSocket | null>(null)
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const warningsRef = useRef({ devtoolsOpen: false })

  const [exam, setExam] = useState<ExamData | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<AnswerState>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [status, setStatus] = useState<AttemptStatus>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [warningInfo, setWarningInfo] = useState<{
    count: number
    max: number
    message: string
    type: string
  } | null>(null)
  const [devtoolsOpen, setDevtoolsOpen] = useState(false)

  const clearExamIntervals = useCallback(() => {
    if (autoSaveRef.current) {
      clearInterval(autoSaveRef.current)
      autoSaveRef.current = null
    }

    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearExamIntervals()
      socketRef.current?.disconnect()
    }
  }, [clearExamIntervals])

  useEffect(() => {
    fetch(`/api/exams/${examId}?withQuestions=true`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Exam not found')
        }

        return (await response.json()) as ExamData
      })
      .then((data) => {
        setExam(data)
        setQuestions(
          data.questions
            .sort((left, right) => left.orderIndex - right.orderIndex)
            .map((entry) => ({
              id: entry.question.id,
              examQuestionId: entry.id,
              text: entry.question.text,
              type: entry.question.type,
              marks: entry.marks,
              options: entry.question.options,
              orderIndex: entry.orderIndex,
            }))
        )
        setStatus('ready')
      })
      .catch((error: unknown) => {
        setStatus('error')
        setErrorMsg(error instanceof Error ? error.message : 'Failed to load exam')
      })
  }, [examId])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && status === 'started' && attemptId) {
        socketRef.current?.emit('student:security_violation', {
          attemptId,
          type: 'TAB_SWITCH',
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [attemptId, status])

  useEffect(() => {
    if (status !== 'started' || !attemptId) return

    const reportViolation = (type: WarningType) => {
      socketRef.current?.emit('student:security_violation', { attemptId, type })
    }

    const handleCopyLike = (event: ClipboardEvent) => {
      event.preventDefault()
      reportViolation('COPY')
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const isPrintScreen = event.key === 'PrintScreen'
      const isScreenshotCombo =
        (event.ctrlKey && event.shiftKey && (event.key === 'S' || event.key === 's')) ||
        (event.metaKey && event.shiftKey && ['3', '4', '5', 'S', 's'].includes(event.key))

      if (isPrintScreen || isScreenshotCombo) {
        reportViolation('SCREENSHOT')
      }
    }

    const detectDevtools = () => {
      const widthGap = window.outerWidth - window.innerWidth
      const heightGap = window.outerHeight - window.innerHeight
      const detected = widthGap > 160 || heightGap > 160

      setDevtoolsOpen(detected)

      if (detected && !warningsRef.current.devtoolsOpen) {
        warningsRef.current.devtoolsOpen = true
        reportViolation('DEVTOOLS')
      }

      if (!detected) {
        warningsRef.current.devtoolsOpen = false
      }
    }

    document.addEventListener('copy', handleCopyLike)
    document.addEventListener('cut', handleCopyLike)
    document.addEventListener('paste', handleCopyLike)
    window.addEventListener('keydown', handleKeyDown)

    const interval = setInterval(detectDevtools, 1500)
    detectDevtools()
    const warningState = warningsRef.current

    return () => {
      document.removeEventListener('copy', handleCopyLike)
      document.removeEventListener('cut', handleCopyLike)
      document.removeEventListener('paste', handleCopyLike)
      window.removeEventListener('keydown', handleKeyDown)
      clearInterval(interval)
      setDevtoolsOpen(false)
      warningState.devtoolsOpen = false
    }
  }, [attemptId, status])

  const startAutoSave = useCallback((socket: AppSocket, activeAttemptId: string) => {
    if (autoSaveRef.current) {
      clearInterval(autoSaveRef.current)
    }

    autoSaveRef.current = setInterval(() => {
      Object.entries(answers).forEach(([questionId, answer]) => {
        socket.emit('student:save_answer', {
          attemptId: activeAttemptId,
          questionId,
          selectedOption: answer.selectedOption,
          answerText: answer.answerText,
        })
      })
    }, 5000)
  }, [answers])

  const startLocalCountdown = useCallback(
    (socket: AppSocket, activeAttemptId: string, initialRemainingSeconds: number) => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
      }

      let remaining = initialRemainingSeconds
      countdownRef.current = setInterval(() => {
        remaining -= 1
        setRemainingSeconds(Math.max(0, remaining))

        if (remaining <= 0) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current)
            countdownRef.current = null
          }

          socket.emit('student:submit_exam', { attemptId: activeAttemptId })
        }
      }, 1000)
    },
    []
  )

  const startExam = useCallback(async () => {
    if (!session?.user) return

    try {
      const tokenResponse = await fetch('/api/socket/token')
      const { token } = (await tokenResponse.json()) as { token: string }
      const socket = getSocket(token)

      socketRef.current = socket
      socket.removeAllListeners()

      socket.emit('student:join_exam', { examId })

      socket.on('exam:joined', () => {
        socket.emit('student:start_attempt', { examId })
      })

      socket.on('exam:attempt_started', (data) => {
        setAttemptId(data.attemptId)
        setRemainingSeconds(data.remainingSeconds)
        setStatus('started')
        startAutoSave(socket, data.attemptId)
        startLocalCountdown(socket, data.attemptId, data.remainingSeconds)
      })

      socket.on('exam:timer_update', (data) => {
        if (data.examId === examId) {
          setRemainingSeconds(data.remaining)
        }
      })

      socket.on('exam:auto_submitted', (data) => {
        if (data.examId !== examId) return
        clearExamIntervals()
        setStatus('submitted')
      })

      socket.on('exam:ended', (data) => {
        if (data.examId !== examId) return
        clearExamIntervals()
        setStatus('submitted')
      })

      socket.on('exam:warning_issued', (data) => {
        if (data.examId !== examId) return
        setWarningInfo({
          count: data.warningCount,
          max: data.maxWarnings,
          message: data.message,
          type: data.type,
        })
      })

      socket.on('error', (data) => {
        clearExamIntervals()
        setStatus('error')
        setErrorMsg(data.message)
      })
    } catch {
      setStatus('error')
      setErrorMsg('Failed to connect to exam server')
    }
  }, [clearExamIntervals, examId, session?.user, startAutoSave, startLocalCountdown])

  const saveAnswer = useCallback(
    (questionId: string, data: { selectedOption?: string; answerText?: string }) => {
      setAnswers((current) => ({ ...current, [questionId]: data }))
      if (attemptId && socketRef.current) {
        socketRef.current.emit('student:save_answer', {
          attemptId,
          questionId,
          ...data,
        })
      }
    },
    [attemptId]
  )

  const handleSubmit = async () => {
    if (!attemptId || submitting) return

    setSubmitting(true)
    clearExamIntervals()

    Object.entries(answers).forEach(([questionId, answer]) => {
      socketRef.current?.emit('student:save_answer', {
        attemptId,
        questionId,
        ...answer,
      })
    })

    socketRef.current?.emit('student:submit_exam', { attemptId })
    setStatus('submitted')
    setShowSubmitConfirm(false)
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remaining = seconds % 60

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    }

    return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
  }

  const isWarning = remainingSeconds !== null && remainingSeconds < 300
  const isCritical = remainingSeconds !== null && remainingSeconds < 60
  const answeredCount = Object.keys(answers).length
  const currentQuestion = questions[currentIndex]

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-gray-500">Loading exam...</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="mx-auto mt-20 max-w-md text-center">
        <div className="mb-4 text-5xl">X</div>
        <h2 className="mb-2 text-xl font-bold text-gray-900">Cannot Access Exam</h2>
        <p className="mb-6 text-gray-500">{errorMsg}</p>
        <button
          onClick={() => router.push('/student/exams')}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Back to Exams
        </button>
      </div>
    )
  }

  if (status === 'submitted') {
    return (
      <div className="mx-auto mt-20 max-w-md text-center">
        <div className="mb-4 text-6xl">OK</div>
        <h2 className="mb-2 text-2xl font-bold text-gray-900">Exam Submitted!</h2>
        <p className="mb-2 text-gray-500">Your answers have been saved and submitted successfully.</p>
        <p className="mb-6 text-sm text-gray-400">You&apos;ll be notified when results are published.</p>
        <button
          onClick={() => router.push('/student/dashboard')}
          className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  if (status === 'ready') {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <h1 className="mb-2 text-2xl font-bold text-gray-900">{exam?.title}</h1>
          <p className="mb-6 text-gray-500">{exam?.subject?.name}</p>
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xl font-bold text-gray-900">{exam?.duration}</p>
              <p className="text-xs text-gray-500">Minutes</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xl font-bold text-gray-900">{questions.length}</p>
              <p className="text-xs text-gray-500">Questions</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xl font-bold text-gray-900">{exam?.totalMarks}</p>
              <p className="text-xs text-gray-500">Total Marks</p>
            </div>
          </div>
          {exam?.instructions && (
            <div className="mb-6 rounded-xl bg-blue-50 p-4 text-left">
              <p className="mb-1 text-sm font-semibold text-blue-900">Instructions:</p>
              <p className="text-sm text-blue-800">{exam.instructions}</p>
            </div>
          )}
          <button
            onClick={startExam}
            className="w-full rounded-xl bg-green-600 py-3 text-lg font-semibold text-white transition hover:bg-green-700"
          >
            Start Exam
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {devtoolsOpen && status === 'started' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 p-6 text-center text-white">
          <div>
            <h2 className="text-2xl font-bold">Exam Locked</h2>
            <p className="mt-2 text-sm text-slate-200">
              Developer tools detected. Close them to continue the exam.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">{exam?.title}</p>
          <p className="text-xs text-gray-400">
            {answeredCount}/{questions.length} answered
          </p>
        </div>
        <div
          className={`rounded-xl px-4 py-2 font-mono text-xl font-bold ${
            isCritical
              ? 'animate-pulse bg-red-100 text-red-600'
              : isWarning
                ? 'bg-orange-100 text-orange-600'
                : 'bg-gray-100 text-gray-900'
          }`}
        >
          {remainingSeconds !== null ? formatTime(remainingSeconds) : '--:--'}
        </div>
      </div>

      {warningInfo && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            warningInfo.count >= warningInfo.max
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-orange-200 bg-orange-50 text-orange-700'
          }`}
        >
          <p className="font-semibold">
            Warning {warningInfo.count}/{warningInfo.max}
          </p>
          <p className="mt-1">{warningInfo.message}</p>
        </div>
      )}

      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      {currentQuestion && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
              {currentQuestion.marks} mark{currentQuestion.marks > 1 ? 's' : ''}
            </span>
          </div>

          <RichTextContent
            html={currentQuestion.text}
            className="rich-text-content mb-5 font-medium text-gray-900"
          />

          {(currentQuestion.type === 'MCQ' || currentQuestion.type === 'TRUE_FALSE') && (
            <div className="space-y-3">
              {currentQuestion.options.map((option) => {
                const isSelected = answers[currentQuestion.id]?.selectedOption === option.id

                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${currentQuestion.id}`}
                      checked={isSelected}
                      onChange={() => saveAnswer(currentQuestion.id, { selectedOption: option.id })}
                      className="h-4 w-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-900">{option.text}</span>
                  </label>
                )
              })}
            </div>
          )}

          {currentQuestion.type === 'SHORT_ANSWER' && (
            <input
              type="text"
              value={answers[currentQuestion.id]?.answerText ?? ''}
              onChange={(event) =>
                saveAnswer(currentQuestion.id, { answerText: event.target.value })
              }
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500"
              placeholder="Type your answer here..."
            />
          )}

          {currentQuestion.type === 'WRITTEN_ANSWER' && (
            <textarea
              value={answers[currentQuestion.id]?.answerText ?? ''}
              onChange={(event) =>
                saveAnswer(currentQuestion.id, { answerText: event.target.value })
              }
              className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-500"
              rows={8}
              placeholder="Write your detailed answer here..."
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          disabled={currentIndex === 0}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          Previous
        </button>

        <div className="flex max-w-xs flex-wrap justify-center gap-1.5">
          {questions.map((question, index) => (
            <button
              key={question.id}
              onClick={() => setCurrentIndex(index)}
              className={`h-7 w-7 rounded text-xs font-medium transition ${
                index === currentIndex
                  ? 'bg-blue-600 text-white'
                  : answers[question.id]
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>

        {currentIndex < questions.length - 1 ? (
          <button
            onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Next
          </button>
        ) : (
          <button
            onClick={() => setShowSubmitConfirm(true)}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Stop and Submit
          </button>
        )}
      </div>

      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-bold text-gray-900">Submit Exam?</h3>
            <p className="mb-2 text-sm text-gray-500">
              You have answered {answeredCount} of {questions.length} questions.
            </p>
            {answeredCount < questions.length && (
              <p className="mb-4 text-sm text-orange-600">
                {questions.length - answeredCount} question
                {questions.length - answeredCount > 1 ? 's' : ''} unanswered.
              </p>
            )}
            <p className="mb-6 text-sm text-gray-500">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Review Answers
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Yes, Stop and Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
