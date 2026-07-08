'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Assignment = {
  id: string
  subject: { id: string; name: string }
  language: { id: string; name: string }
  group: { id: string; name: string }
  academicYear: { id: string; name: string }
  semester: { id: string; name: string }
}

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

export default function QuestionBankManager({
  questions,
  assignments,
  teacherId,
}: {
  questions: Question[]
  assignments: Assignment[]
  teacherId: string
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState('ALL')

  const [form, setForm] = useState({
    assignmentId: assignments[0]?.id ?? '',
    type: 'MCQ',
    text: '',
    marks: 2,
    difficulty: 'medium',
    expectedAnswer: '',
    keywords: '',
    explanation: '',
    options: [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ],
  })

  const selectedAssignment = assignments.find((a) => a.id === form.assignmentId)

  const handleOptionChange = (index: number, field: 'text' | 'isCorrect', value: string | boolean) => {
    const newOptions = [...form.options]
    newOptions[index] = { ...newOptions[index], [field]: value }
    // For MCQ, only one correct answer; for True/False enforce mutual exclusivity
    if (field === 'isCorrect' && value === true && form.type !== 'WRITTEN_ANSWER') {
      newOptions.forEach((o, i) => { if (i !== index) newOptions[i] = { ...o, isCorrect: false } })
    }
    setForm({ ...form, options: newOptions })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAssignment) return
    setLoading(true)
    setError(null)

    const payload = {
      subjectId: selectedAssignment.subject.id,
      languageId: selectedAssignment.language.id,
      groupId: selectedAssignment.group.id,
      academicYearId: selectedAssignment.academicYear.id,
      semesterId: selectedAssignment.semester.id,
      type: form.type,
      text: form.text,
      marks: form.marks,
      difficulty: form.difficulty,
      expectedAnswer: form.expectedAnswer || null,
      keywords: form.keywords ? form.keywords.split(',').map((k) => k.trim()).filter(Boolean) : [],
      explanation: form.explanation || null,
      options:
        form.type === 'MCQ' || form.type === 'TRUE_FALSE'
          ? form.options
              .filter((o) => o.text.trim())
              .map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: i }))
          : [],
    }

    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create question')
      }
      setShowForm(false)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this question?')) return
    await fetch(`/api/questions/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  const filteredQuestions = filterType === 'ALL'
    ? questions
    : questions.filter((q) => q.type === filterType)

  const needsOptions = form.type === 'MCQ' || form.type === 'TRUE_FALSE'
  const optionCount = form.type === 'TRUE_FALSE' ? 2 : 4

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex gap-2 flex-wrap">
          {['ALL', ...QUESTION_TYPES.map((t) => t.value)].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filterType === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
              }`}
            >
              {t === 'ALL' ? 'All Types' : QUESTION_TYPES.find((q) => q.value === t)?.label ?? t}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(true)}
          disabled={assignments.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          + Add Question
        </button>
      </div>

      {assignments.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          You have no assignments yet. Ask admin to assign you to subjects/groups before creating questions.
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">New Question</h3>
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assignment *</label>
                <select
                  value={form.assignmentId}
                  onChange={(e) => setForm({ ...form, assignmentId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                  required
                >
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.subject.name} · {a.group.name} · {a.academicYear.name} · {a.semester.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Marks *</label>
                  <input
                    type="number"
                    min={1}
                    value={form.marks}
                    onChange={(e) => setForm({ ...form, marks: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                  <select
                    value={form.difficulty}
                    onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Question Text *</label>
              <textarea
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                rows={3}
                required
                placeholder="Enter your question here..."
              />
            </div>

            {/* MCQ / T-F Options */}
            {needsOptions && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Options * <span className="text-gray-400 font-normal">(check the correct answer)</span>
                </label>
                <div className="space-y-2">
                  {Array.from({ length: optionCount }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={form.options[i]?.isCorrect ?? false}
                        onChange={(e) => handleOptionChange(i, 'isCorrect', e.target.checked)}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <input
                        value={form.options[i]?.text ?? ''}
                        onChange={(e) => handleOptionChange(i, 'text', e.target.value)}
                        placeholder={form.type === 'TRUE_FALSE' ? (i === 0 ? 'True' : 'False') : `Option ${i + 1}`}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Short answer */}
            {form.type === 'SHORT_ANSWER' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expected Answer</label>
                  <input
                    value={form.expectedAnswer}
                    onChange={(e) => setForm({ ...form, expectedAnswer: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                    placeholder="Exact answer for auto-checking"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Keywords (comma-separated)</label>
                  <input
                    value={form.keywords}
                    onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 outline-none"
                    placeholder="keyword1, keyword2, keyword3"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button type="submit" disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Creating...' : 'Create Question'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Question List */}
      <div className="space-y-3">
        {filteredQuestions.map((q) => (
          <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor(q.type)}`}>
                    {QUESTION_TYPES.find((t) => t.value === q.type)?.label ?? q.type}
                  </span>
                  <span className="text-xs text-gray-500">{q.marks} mark{q.marks > 1 ? 's' : ''}</span>
                  {q.difficulty && (
                    <span className="text-xs text-gray-400 capitalize">{q.difficulty}</span>
                  )}
                  <span className="text-xs text-gray-400">
                    {q.subject.name} · {q.group.name} · {q.academicYear.name} · {q.semester.name}
                  </span>
                </div>
                <p className="text-sm text-gray-900 line-clamp-2">{q.text}</p>
                {q.options.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {q.options.map((o) => (
                      <div key={o.id} className={`text-xs px-2 py-1 rounded ${o.isCorrect ? 'bg-green-50 text-green-700 font-medium' : 'bg-gray-50 text-gray-600'}`}>
                        {o.isCorrect ? '✓ ' : ''}{o.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {q._count.examQuestions > 0 && (
                  <span className="text-xs text-gray-400">{q._count.examQuestions} exam{q._count.examQuestions > 1 ? 's' : ''}</span>
                )}
                <button onClick={() => handleDelete(q.id)}
                  className="text-xs text-red-500 hover:text-red-700 font-medium">
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {filteredQuestions.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
            <p className="text-gray-400 text-sm">No questions found. Add your first question above.</p>
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
