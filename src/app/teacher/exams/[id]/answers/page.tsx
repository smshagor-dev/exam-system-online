'use client'

import { use, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import RichTextContent from '@/components/editor/RichTextContent'

type Answer = {
  id: string
  questionId: string
  question: {
    id: string
    text: string
    type: string
    marks: number
    options: { id: string; text: string; isCorrect: boolean }[]
    expectedAnswer: string | null
  }
  selectedOption: string | null
  answerText: string | null
  checkStatus: string
  isCorrect: boolean | null
  marksAwarded: number | null
  teacherMarks: number | null
  teacherFeedback: string | null
  aiSuggestedMarks: number | null
  aiSuggestedFeedback: string | null
}

type Result = {
  id: string
  examId: string
  totalMarks: number
  marksObtained: number
  percentage: number
  grade: string
  isPassed: boolean
  status: string
  exam: { title: string; subject: { name: string }; showAnswers: boolean }
  attempt: {
    student: { user: { name: string; email: string } }
    answers: Answer[]
  }
}

type PageProps = { params: Promise<{ id: string }> }

export default function AnswersReviewPage({ params }: PageProps) {
  use(params)
  const searchParams = useSearchParams()
  const resultId = searchParams?.get('resultId') ?? null
  const router = useRouter()

  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [markOverrides, setMarkOverrides] = useState<Record<string, { marks: number; feedback: string }>>({})
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!resultId) return
    fetch(`/api/results/${resultId}`)
      .then((r) => r.json())
      .then((data) => {
        setResult(data)
        // Initialize overrides from existing teacher marks
        const init: Record<string, { marks: number; feedback: string }> = {}
        data.attempt.answers.forEach((a: Answer) => {
          if (a.teacherMarks !== null) {
            init[a.id] = { marks: a.teacherMarks, feedback: a.teacherFeedback ?? '' }
          } else if (a.aiSuggestedMarks !== null) {
            init[a.id] = { marks: a.aiSuggestedMarks, feedback: a.aiSuggestedFeedback ?? '' }
          } else {
            init[a.id] = { marks: a.marksAwarded ?? 0, feedback: '' }
          }
        })
        setMarkOverrides(init)
        setLoading(false)
      })
  }, [resultId])

  const saveAnswer = async (answerId: string) => {
    if (!resultId) return
    setSaving(answerId)
    try {
      await fetch(`/api/results/${resultId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review_answer',
          answerId,
          marks: markOverrides[answerId]?.marks ?? 0,
          feedback: markOverrides[answerId]?.feedback ?? '',
        }),
      })
      setMessage({ type: 'success', text: 'Saved!' })
      setTimeout(() => setMessage(null), 2000)
    } catch {
      setMessage({ type: 'error', text: 'Save failed' })
    } finally {
      setSaving(null)
    }
  }

  const publishResult = async () => {
    if (!resultId || !confirm('Publish this result? Student will be notified.')) return
    setPublishing(true)
    const res = await fetch(`/api/results/${resultId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'publish' }),
    })
    if (res.ok) {
      setMessage({ type: 'success', text: 'Result published! Student notified.' })
      router.push('/teacher/reviews')
    } else {
      setMessage({ type: 'error', text: 'Publish failed' })
    }
    setPublishing(false)
  }

  if (loading) return <div className="py-20 text-center text-gray-400">Loading...</div>
  if (!result) return <div className="py-20 text-center text-gray-400">Result not found</div>

  const manualAnswers = result.attempt.answers.filter(
    (a) => a.question.type === 'SHORT_ANSWER' || a.question.type === 'WRITTEN_ANSWER'
  )
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{result.exam.title}</h1>
            <p className="text-gray-500 text-sm">{result.exam.subject.name}</p>
            <p className="text-gray-700 text-sm mt-1">
              Student: <span className="font-medium">{result.attempt.student.user.name}</span>
              <span className="text-gray-400 ml-2">{result.attempt.student.user.email}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{result.marksObtained}/{result.totalMarks}</p>
            <p className="text-sm text-gray-500">{result.percentage.toFixed(1)}% · Grade {result.grade}</p>
            <span className={`text-sm font-medium ${result.isPassed ? 'text-green-600' : 'text-red-600'}`}>
              {result.isPassed ? '✓ Pass' : '✗ Fail'}
            </span>
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* Manual Review Section */}
      {manualAnswers.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-900">Answers Requiring Review ({manualAnswers.length})</h2>
          {manualAnswers.map((answer) => {
            const override = markOverrides[answer.id] ?? { marks: 0, feedback: '' }
            const maxMarks = answer.question.marks
            return (
              <div key={answer.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${answer.question.type === 'SHORT_ANSWER' ? 'bg-yellow-100 text-yellow-700' : 'bg-purple-100 text-purple-700'}`}>
                    {answer.question.type.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-gray-500">Max: {maxMarks} marks</span>
                  {answer.aiSuggestedMarks !== null && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      AI suggests: {answer.aiSuggestedMarks}
                    </span>
                  )}
                </div>

                <RichTextContent html={answer.question.text} className="rich-text-content mb-3 text-gray-900" />

                {answer.question.expectedAnswer && (
                  <div className="bg-green-50 rounded-lg p-3 mb-3">
                    <p className="text-xs font-semibold text-green-800 mb-1">Expected Answer:</p>
                    <p className="text-sm text-green-700">{answer.question.expectedAnswer}</p>
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-3 mb-4">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Student Answer:</p>
                  <p className="text-sm text-gray-900">{answer.answerText || <span className="text-gray-400 italic">No answer provided</span>}</p>
                </div>

                {answer.aiSuggestedFeedback && (
                  <div className="bg-blue-50 rounded-lg p-3 mb-4">
                    <p className="text-xs font-semibold text-blue-800 mb-1">AI Feedback Suggestion:</p>
                    <p className="text-sm text-blue-700">{answer.aiSuggestedFeedback}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Marks Awarded (0–{maxMarks})
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={maxMarks}
                      step={0.5}
                      value={override.marks}
                      onChange={(e) => setMarkOverrides((prev) => ({
                        ...prev,
                        [answer.id]: { ...prev[answer.id], marks: parseFloat(e.target.value) },
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Feedback (optional)</label>
                    <input
                      type="text"
                      value={override.feedback}
                      onChange={(e) => setMarkOverrides((prev) => ({
                        ...prev,
                        [answer.id]: { ...prev[answer.id], feedback: e.target.value },
                      }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
                      placeholder="Optional feedback for student..."
                    />
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => saveAnswer(answer.id)}
                    disabled={saving === answer.id}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving === answer.id ? 'Saving...' : 'Save Marks'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Publish */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 mb-3">Finalize & Publish</h2>
        <p className="text-sm text-gray-500 mb-4">
          Once published, the student will be notified and can view their result.
          Make sure all answers have been reviewed before publishing.
        </p>
        <button
          onClick={publishResult}
          disabled={publishing}
          className="px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
        >
          {publishing ? 'Publishing...' : 'Publish Result'}
        </button>
      </div>
    </div>
  )
}
