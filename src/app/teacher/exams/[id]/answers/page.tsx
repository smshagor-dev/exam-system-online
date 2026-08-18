'use client'

import { use, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import RichTextContent from '@/components/editor/RichTextContent'
import { CodeBlock } from '@/components/code/CodeEditor'
import { parseQuestionCodeMetadata } from '@/lib/question-code'

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
      .then((response) => response.json())
      .then((data) => {
        setResult(data)
        const initial: Record<string, { marks: number; feedback: string }> = {}
        data.attempt.answers.forEach((answer: Answer) => {
          if (answer.teacherMarks !== null) {
            initial[answer.id] = { marks: answer.teacherMarks, feedback: answer.teacherFeedback ?? '' }
          } else if (answer.aiSuggestedMarks !== null) {
            initial[answer.id] = { marks: answer.aiSuggestedMarks, feedback: answer.aiSuggestedFeedback ?? '' }
          } else {
            initial[answer.id] = { marks: answer.marksAwarded ?? 0, feedback: '' }
          }
        })
        setMarkOverrides(initial)
        setLoading(false)
      })
  }, [resultId])

  const saveAnswer = async (answerId: string) => {
    if (!resultId) return
    setSaving(answerId)
    try {
      const response = await fetch(`/api/results/${resultId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'review_answer',
          answerId,
          marks: markOverrides[answerId]?.marks ?? 0,
          feedback: markOverrides[answerId]?.feedback ?? '',
        }),
      })
      if (!response.ok) throw new Error('Save failed')
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
    const response = await fetch(`/api/results/${resultId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'publish' }),
    })
    if (response.ok) {
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
    (answer) => answer.question.type === 'SHORT_ANSWER' || answer.question.type === 'WRITTEN_ANSWER'
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{result.exam.title}</h1>
            <p className="text-sm text-gray-500">{result.exam.subject.name}</p>
            <p className="mt-1 text-sm text-gray-700">
              Student: <span className="font-medium">{result.attempt.student.user.name}</span>
              <span className="ml-2 text-gray-400">{result.attempt.student.user.email}</span>
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
        <div className={`rounded-lg border p-3 text-sm ${message.type === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {manualAnswers.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-semibold text-gray-900">Answers Requiring Review ({manualAnswers.length})</h2>
          {manualAnswers.map((answer) => {
            const override = markOverrides[answer.id] ?? { marks: 0, feedback: '' }
            const maxMarks = answer.question.marks
            const parsedQuestion = parseQuestionCodeMetadata(answer.question.text)
            const codeMeta = parsedQuestion.metadata

            return (
              <div key={answer.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${answer.question.type === 'SHORT_ANSWER' ? 'bg-yellow-100 text-yellow-700' : 'bg-purple-100 text-purple-700'}`}>
                    {answer.question.type.replace('_', ' ')}
                  </span>
                  {codeMeta.contentMode === 'TEXT_CODE' && <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-white">CODE QUESTION</span>}
                  {codeMeta.answerMode === 'CODE' && <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">CODE ANSWER</span>}
                  <span className="text-xs text-gray-500">Max: {maxMarks} marks</span>
                  {answer.aiSuggestedMarks !== null && <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">AI suggests: {answer.aiSuggestedMarks}</span>}
                </div>

                <RichTextContent html={parsedQuestion.text} className="rich-text-content mb-3 text-gray-900" />
                {codeMeta.contentMode === 'TEXT_CODE' && codeMeta.codeContent && (
                  <div className="mb-4"><CodeBlock code={codeMeta.codeContent} language={codeMeta.codeLanguage} label="Question Code" /></div>
                )}

                {answer.question.expectedAnswer && (
                  <div className="mb-3">
                    {codeMeta.answerMode === 'CODE' ? (
                      <CodeBlock code={answer.question.expectedAnswer} language={codeMeta.answerCodeLanguage} label="Reference / Expected Code" />
                    ) : (
                      <div className="rounded-lg bg-green-50 p-3">
                        <p className="mb-1 text-xs font-semibold text-green-800">Expected Answer:</p>
                        <p className="text-sm text-green-700">{answer.question.expectedAnswer}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="mb-4">
                  {codeMeta.answerMode === 'CODE' ? (
                    answer.answerText ? <CodeBlock code={answer.answerText} language={codeMeta.answerCodeLanguage} label="Student Code Answer" /> : <div className="rounded-lg bg-gray-50 p-3 text-sm italic text-gray-400">No answer provided</div>
                  ) : (
                    <div className="rounded-lg bg-gray-50 p-3">
                      <p className="mb-1 text-xs font-semibold text-gray-600">Student Answer:</p>
                      <p className="whitespace-pre-wrap text-sm text-gray-900">{answer.answerText || <span className="italic text-gray-400">No answer provided</span>}</p>
                    </div>
                  )}
                </div>

                {answer.aiSuggestedFeedback && <div className="mb-4 rounded-lg bg-blue-50 p-3"><p className="mb-1 text-xs font-semibold text-blue-800">AI Feedback Suggestion:</p><p className="text-sm text-blue-700">{answer.aiSuggestedFeedback}</p></div>}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700">Marks Awarded (0–{maxMarks})</label>
                    <input type="number" min={0} max={maxMarks} step={0.5} value={override.marks} onChange={(event) => setMarkOverrides((prev) => ({ ...prev, [answer.id]: { ...prev[answer.id], marks: Number(event.target.value) } }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-700">Feedback (optional)</label>
                    <input type="text" value={override.feedback} onChange={(event) => setMarkOverrides((prev) => ({ ...prev, [answer.id]: { ...prev[answer.id], feedback: event.target.value } }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500" placeholder="Optional feedback for student..." />
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button onClick={() => saveAnswer(answer.id)} disabled={saving === answer.id} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    {saving === answer.id ? 'Saving...' : 'Save Marks'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-gray-900">Finalize & Publish</h2>
        <p className="mb-4 text-sm text-gray-500">Once published, the student will be notified and can view their result. Make sure all answers have been reviewed before publishing.</p>
        <button onClick={publishResult} disabled={publishing} className="rounded-lg bg-green-600 px-6 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50">
          {publishing ? 'Publishing...' : 'Publish Result'}
        </button>
      </div>
    </div>
  )
}
