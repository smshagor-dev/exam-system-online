'use client'

import { use, useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { getSocket } from '@/lib/socket'
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

type Props = { params: Promise<{ id: string }> }

export default function ExamAttemptPage({ params }: Props) {
  const { data: session } = useSession()
  const router = useRouter()
  const { id: examId } = use(params)
  const socketRef = useRef<any>(null)
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const warningsRef = useRef<Record<string, boolean>>({})

  const [exam, setExam] = useState<any>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, { selectedOption?: string; answerText?: string }>>({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'started' | 'submitted' | 'error'>('loading')
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

  useEffect(() => {
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  // Load exam data
  useEffect(() => {
    fetch(`/api/exams/${examId}?withQuestions=true`)
      .then((r) => {
        if (!r.ok) throw new Error('Exam not found')
        return r.json()
      })
      .then((data) => {
        setExam(data)
        setQuestions(
          data.questions
            .sort((a: any, b: any) => a.orderIndex - b.orderIndex)
            .map((eq: any) => ({
              id: eq.question.id,
              examQuestionId: eq.id,
              text: eq.question.text,
              type: eq.question.type,
              marks: eq.marks,
              options: eq.question.options,
              orderIndex: eq.orderIndex,
            }))
        )
        setStatus('ready')
      })
      .catch((err) => { setStatus('error'); setErrorMsg(err.message) })
  }, [examId])

  // Detect tab switch
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && status === 'started' && attemptId) {
        socketRef.current?.emit('student:security_violation', { attemptId, type: 'TAB_SWITCH' })
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [status, attemptId])

  useEffect(() => {
    if (status !== 'started' || !attemptId) return

    const reportViolation = (type: 'COPY' | 'SCREENSHOT' | 'DEVTOOLS') => {
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

    return () => {
      document.removeEventListener('copy', handleCopyLike)
      document.removeEventListener('cut', handleCopyLike)
      document.removeEventListener('paste', handleCopyLike)
      window.removeEventListener('keydown', handleKeyDown)
      clearInterval(interval)
      setDevtoolsOpen(false)
      warningsRef.current.devtoolsOpen = false
    }
  }, [status, attemptId])

  // Connect socket and start exam
  const startExam = useCallback(async () => {
    if (!session?.user) return

    try {
      const tokenRes = await fetch('/api/socket/token')
      const { token } = await tokenRes.json()
      const socket = getSocket(token)
      socketRef.current = socket

      // Join exam room
      socket.emit('student:join_exam', { examId })

      socket.on('exam:joined', (data) => {
        // Now start the attempt
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
        if (data.examId === examId) setRemainingSeconds(data.remaining)
      })

      socket.on('exam:auto_submitted', (data) => {
        if (data.examId === examId) {
          setStatus('submitted')
          clearInterval(autoSaveRef.current!)
          clearInterval(countdownRef.current!)
        }
      })

      socket.on('exam:ended', (data) => {
        if (data.examId === examId && status !== 'submitted') {
          setStatus('submitted')
          clearInterval(autoSaveRef.current!)
          clearInterval(countdownRef.current!)
        }
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
        setStatus('error')
        setErrorMsg(data.message)
      })
    } catch (err: any) {
      setStatus('error')
      setErrorMsg('Failed to connect to exam server')
    }
  }, [session, examId])

  // Auto-save every 5 seconds
  const startAutoSave = (socket: any, aid: string) => {
    autoSaveRef.current = setInterval(() => {
      const currentAnswers = Object.entries(answers)
      currentAnswers.forEach(([questionId, answer]) => {
        socket.emit('student:save_answer', {
          attemptId: aid,
          questionId,
          selectedOption: answer.selectedOption,
          answerText: answer.answerText,
        })
      })
    }, 5000)
  }

  // Save individual answer immediately on change
  const saveAnswer = useCallback(
    (questionId: string, data: { selectedOption?: string; answerText?: string }) => {
      setAnswers((prev) => ({ ...prev, [questionId]: data }))
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
    clearInterval(autoSaveRef.current!)
    clearInterval(countdownRef.current!)

    // Final save of all answers
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

  const startLocalCountdown = (socket: any, aid: string, initialRemainingSeconds: number) => {
    clearInterval(countdownRef.current!)

    let remaining = initialRemainingSeconds
    countdownRef.current = setInterval(() => {
      remaining -= 1
      setRemainingSeconds(Math.max(0, remaining))

      if (remaining <= 0) {
        clearInterval(countdownRef.current!)
        socket.emit('student:submit_exam', { attemptId: aid })
      }
    }, 1000)
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const isWarning = remainingSeconds !== null && remainingSeconds < 300
  const isCritical = remainingSeconds !== null && remainingSeconds < 60

  const answeredCount = Object.keys(answers).length

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-500">Loading exam...</p>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="text-5xl mb-4">❌</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Cannot Access Exam</h2>
        <p className="text-gray-500 mb-6">{errorMsg}</p>
        <button onClick={() => router.push('/student/exams')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          Back to Exams
        </button>
      </div>
    )
  }

  if (status === 'submitted') {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Exam Submitted!</h2>
        <p className="text-gray-500 mb-2">Your answers have been saved and submitted successfully.</p>
        <p className="text-sm text-gray-400 mb-6">You'll be notified when results are published.</p>
        <button onClick={() => router.push('/student/dashboard')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
          Back to Dashboard
        </button>
      </div>
    )
  }

  if (status === 'ready') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{exam?.title}</h1>
          <p className="text-gray-500 mb-6">{exam?.subject?.name}</p>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xl font-bold text-gray-900">{exam?.duration}</p>
              <p className="text-xs text-gray-500">Minutes</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xl font-bold text-gray-900">{questions.length}</p>
              <p className="text-xs text-gray-500">Questions</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xl font-bold text-gray-900">{exam?.totalMarks}</p>
              <p className="text-xs text-gray-500">Total Marks</p>
            </div>
          </div>
          {exam?.instructions && (
            <div className="bg-blue-50 rounded-xl p-4 text-left mb-6">
              <p className="text-sm font-semibold text-blue-900 mb-1">Instructions:</p>
              <p className="text-sm text-blue-800">{exam.instructions}</p>
            </div>
          )}
          <button onClick={startExam}
            className="w-full py-3 bg-green-600 text-white rounded-xl text-lg font-semibold hover:bg-green-700 transition">
            Start Exam
          </button>
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentIndex]

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {devtoolsOpen && status === 'started' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 text-white p-6 text-center">
          <div>
            <h2 className="text-2xl font-bold">Exam Locked</h2>
            <p className="mt-2 text-sm text-slate-200">
              Developer tools detected. Close them to continue the exam.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{exam?.title}</p>
          <p className="text-xs text-gray-400">{answeredCount}/{questions.length} answered</p>
        </div>
        <div className={`text-xl font-mono font-bold px-4 py-2 rounded-xl ${
          isCritical ? 'bg-red-100 text-red-600 animate-pulse'
          : isWarning ? 'bg-orange-100 text-orange-600'
          : 'bg-gray-100 text-gray-900'
        }`}>
          {remainingSeconds !== null ? formatTime(remainingSeconds) : '--:--'}
        </div>
      </div>

      {warningInfo && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          warningInfo.count >= warningInfo.max
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-orange-200 bg-orange-50 text-orange-700'
        }`}>
          <p className="font-semibold">
            Warning {warningInfo.count}/{warningInfo.max}
          </p>
          <p className="mt-1">{warningInfo.message}</p>
        </div>
      )}

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 transition-all duration-300"
          style={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      {/* Question Card */}
      {currentQuestion && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-500">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
              {currentQuestion.marks} mark{currentQuestion.marks > 1 ? 's' : ''}
            </span>
          </div>

          <RichTextContent html={currentQuestion.text} className="rich-text-content mb-5 text-gray-900 font-medium" />

          {/* MCQ / True-False */}
          {(currentQuestion.type === 'MCQ' || currentQuestion.type === 'TRUE_FALSE') && (
            <div className="space-y-3">
              {currentQuestion.options.map((opt) => {
                const isSelected = answers[currentQuestion.id]?.selectedOption === opt.id
                return (
                  <label key={opt.id}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <input type="radio" name={`q-${currentQuestion.id}`}
                      checked={isSelected}
                      onChange={() => saveAnswer(currentQuestion.id, { selectedOption: opt.id })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-900">{opt.text}</span>
                  </label>
                )
              })}
            </div>
          )}

          {/* Short Answer */}
          {currentQuestion.type === 'SHORT_ANSWER' && (
            <input
              type="text"
              value={answers[currentQuestion.id]?.answerText ?? ''}
              onChange={(e) => saveAnswer(currentQuestion.id, { answerText: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500 transition"
              placeholder="Type your answer here..."
            />
          )}

          {/* Written Answer */}
          {currentQuestion.type === 'WRITTEN_ANSWER' && (
            <textarea
              value={answers[currentQuestion.id]?.answerText ?? ''}
              onChange={(e) => saveAnswer(currentQuestion.id, { answerText: e.target.value })}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-blue-500 transition resize-none"
              rows={8}
              placeholder="Write your detailed answer here..."
            />
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-40">
          ← Previous
        </button>

        <div className="flex gap-1.5 flex-wrap justify-center max-w-xs">
          {questions.map((q, i) => (
            <button key={q.id}
              onClick={() => setCurrentIndex(i)}
              className={`w-7 h-7 rounded text-xs font-medium transition ${
                i === currentIndex ? 'bg-blue-600 text-white'
                : answers[q.id] ? 'bg-green-500 text-white'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}>
              {i + 1}
            </button>
          ))}
        </div>

        {currentIndex < questions.length - 1 ? (
          <button onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Next →
          </button>
        ) : (
          <button onClick={() => setShowSubmitConfirm(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700">
            Stop & Submit
          </button>
        )}
      </div>

      {/* Submit Confirm Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Submit Exam?</h3>
            <p className="text-gray-500 text-sm mb-2">
              You have answered {answeredCount} of {questions.length} questions.
            </p>
            {answeredCount < questions.length && (
              <p className="text-orange-600 text-sm mb-4">
                ⚠️ {questions.length - answeredCount} question{questions.length - answeredCount > 1 ? 's' : ''} unanswered.
              </p>
            )}
            <p className="text-gray-500 text-sm mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                Review Answers
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                {submitting ? 'Submitting...' : 'Yes, Stop & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
