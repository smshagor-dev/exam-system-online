'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Question = {
  id: string
  text: string
  type: string
  marks: number
  difficulty: string | null
  subject: { name: string }
  language: { name: string }
  group: { name: string }
  academicYear: { name: string }
  semester: { name: string }
  options: { id: string; text: string; isCorrect: boolean; orderIndex: number }[]
  _count: { examQuestions: number }
}

const QUESTION_TYPES = [
  { value: 'MCQ', label: 'MCQ' },
  { value: 'TRUE_FALSE', label: 'True / False' },
  { value: 'SHORT_ANSWER', label: 'Short Answer' },
  { value: 'WRITTEN_ANSWER', label: 'Written Answer' },
]

function stripHtml(html: string) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function QuestionBankManager({
  questions,
  createHref,
}: {
  questions: Question[]
  createHref?: string
}) {
  const router = useRouter()
  const [filterType, setFilterType] = useState('ALL')

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this question?')) return
    await fetch(`/api/questions/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  const filteredQuestions =
    filterType === 'ALL'
      ? questions
      : questions.filter((question) => question.type === filterType)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {['ALL', ...QUESTION_TYPES.map((type) => type.value)].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                filterType === type
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-blue-300'
              }`}
            >
              {type === 'ALL' ? 'All Types' : QUESTION_TYPES.find((questionType) => questionType.value === type)?.label ?? type}
            </button>
          ))}
        </div>

        {createHref && (
          <Link
            href={createHref}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            + Add New
          </Link>
        )}
      </div>

      <div className="space-y-3">
        {filteredQuestions.map((question) => (
          <div key={question.id} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${typeColor(question.type)}`}>
                    {QUESTION_TYPES.find((type) => type.value === question.type)?.label ?? question.type}
                  </span>
                  <span className="text-xs text-gray-500">
                    {question.marks} mark{question.marks > 1 ? 's' : ''}
                  </span>
                  {question.difficulty && (
                    <span className="text-xs capitalize text-gray-400">{question.difficulty}</span>
                  )}
                  <span className="text-xs text-gray-400">
                    {question.subject.name} | {question.group.name} | {question.academicYear.name} | {question.semester.name} | {question.language.name}
                  </span>
                </div>

                <p className="line-clamp-2 text-sm text-gray-900">{stripHtml(question.text)}</p>

                {question.options.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {question.options.map((option) => (
                      <div
                        key={option.id}
                        className={`rounded px-2 py-1 text-xs ${
                          option.isCorrect
                            ? 'bg-green-50 font-medium text-green-700'
                            : 'bg-gray-50 text-gray-600'
                        }`}
                      >
                        {option.isCorrect ? 'Correct: ' : ''}
                        {option.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {question._count.examQuestions > 0 && (
                  <span className="text-xs text-gray-400">
                    {question._count.examQuestions} exam{question._count.examQuestions > 1 ? 's' : ''}
                  </span>
                )}
                <button
                  onClick={() => handleDelete(question.id)}
                  className="text-xs font-medium text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredQuestions.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <p className="text-sm text-gray-400">No questions found for this subject yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function typeColor(type: string) {
  const map: Record<string, string> = {
    MCQ: 'bg-blue-100 text-blue-700',
    TRUE_FALSE: 'bg-green-100 text-green-700',
    SHORT_ANSWER: 'bg-yellow-100 text-yellow-700',
    WRITTEN_ANSWER: 'bg-purple-100 text-purple-700',
  }

  return map[type] ?? 'bg-gray-100 text-gray-700'
}
