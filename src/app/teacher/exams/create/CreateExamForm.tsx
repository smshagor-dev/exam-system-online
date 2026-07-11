'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Assignment = {
  id: string
  departmentId: string
  subjectId: string
  languageId: string
  groupId: string
  academicYearId: string
  semesterId: string
  department: { id: string; name: string }
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
  options: { id: string; text: string; isCorrect: boolean }[]
}

const RESULT_MODES = [
  { value: 'AUTO', label: 'Auto', desc: 'MCQ/T-F/Short auto-checked instantly' },
  { value: 'TEACHER_REVIEW', label: 'Teacher Review', desc: 'Short/Written reviewed manually' },
  { value: 'AI_ASSISTED_OPTIONAL', label: 'AI Assisted', desc: 'AI suggests marks; teacher confirms' },
]

export default function CreateExamForm({
  assignments,
}: {
  assignments: Assignment[]
}) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [selectedQuestions, setSelectedQuestions] = useState<
    { questionId: string; orderIndex: number; marks: number }[]
  >([])

  const [form, setForm] = useState({
    assignmentId: assignments[0]?.id ?? '',
    title: '',
    description: '',
    questionType: 'MIXED',
    resultMode: 'AUTO',
    passingMarks: 0,
    duration: 60,
    startTime: '',
    endTime: '',
    autoPublish: false,
    allowRetake: false,
    showAnswers: false,
    showMarks: true,
    instructions: '',
  })

  const selectedAssignment = assignments.find((a) => a.id === form.assignmentId)
  const totalMarks = selectedQuestions.reduce((sum, sq) => sum + sq.marks, 0)

  // Fetch questions when assignment changes
  useEffect(() => {
    if (!selectedAssignment) return
    fetch(
      `/api/questions?subjectId=${selectedAssignment.subjectId}&groupId=${selectedAssignment.groupId}&academicYearId=${selectedAssignment.academicYearId}&semesterId=${selectedAssignment.semesterId}`
    )
      .then((r) => r.json())
      .then(setQuestions)
      .catch(console.error)
  }, [selectedAssignment])

  const toggleQuestion = (q: Question) => {
    const exists = selectedQuestions.find((sq) => sq.questionId === q.id)
    if (exists) {
      setSelectedQuestions(selectedQuestions.filter((sq) => sq.questionId !== q.id))
    } else {
      setSelectedQuestions([
        ...selectedQuestions,
        { questionId: q.id, orderIndex: selectedQuestions.length + 1, marks: q.marks },
      ])
    }
  }

  const updateQuestionMarks = (questionId: string, marks: number) => {
    setSelectedQuestions(selectedQuestions.map((sq) =>
      sq.questionId === questionId ? { ...sq, marks } : sq
    ))
  }

  const handleSubmit = async () => {
    if (!selectedAssignment) return
    if (selectedQuestions.length === 0) {
      setError('Please select at least one question')
      return
    }
    setLoading(true)
    setError(null)

    const payload = {
      title: form.title,
      description: form.description,
      departmentId: selectedAssignment.departmentId,
      subjectId: selectedAssignment.subjectId,
      languageId: selectedAssignment.languageId,
      groupId: selectedAssignment.groupId,
      academicYearId: selectedAssignment.academicYearId,
      semesterId: selectedAssignment.semesterId,
      questionType: form.questionType,
      resultMode: form.resultMode,
      totalMarks,
      passingMarks: form.passingMarks,
      duration: form.duration,
      startTime: new Date(form.startTime).toISOString(),
      endTime: new Date(form.endTime).toISOString(),
      autoPublish: form.autoPublish,
      allowRetake: form.allowRetake,
      showAnswers: form.showAnswers,
      showMarks: form.showMarks,
      instructions: form.instructions,
      questionIds: selectedQuestions,
    }

    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create exam')
      }
      await res.json()
      router.push(`/teacher/exams`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create exam')
    } finally {
      setLoading(false)
    }
  }

  const isSelected = (id: string) => selectedQuestions.some((sq) => sq.questionId === id)

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center gap-3">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {s}
            </div>
            <span className={`text-sm ${step === s ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
              {s === 1 ? 'Basic Info' : s === 2 ? 'Select Questions' : 'Settings'}
            </span>
            {s < 3 && <div className="w-8 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
      )}

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Exam Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Assignment (Subject/Group/Year/Department Language/Semester) *</label>
              <select
                value={form.assignmentId}
                onChange={(e) => setForm({ ...form, assignmentId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
              >
                {assignments.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.subject.name} · {a.group.name} · {a.academicYear.name} · {a.semester.name} ({a.language.name})
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Exam Title *</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
                placeholder="e.g. Data Structures Mid-term Exam"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
                rows={2}
                placeholder="Optional description for students"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
              <input
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
              <input
                type="datetime-local"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes) *</label>
              <input
                type="number"
                min={5}
                max={480}
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Passing Marks *</label>
              <input
                type="number"
                min={0}
                value={form.passingMarks}
                onChange={(e) => setForm({ ...form, passingMarks: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Result Mode *</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {RESULT_MODES.map((mode) => (
                  <label
                    key={mode.value}
                    className={`flex flex-col gap-1 p-3 rounded-lg border-2 cursor-pointer transition ${
                      form.resultMode === mode.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="resultMode"
                      value={mode.value}
                      checked={form.resultMode === mode.value}
                      onChange={(e) => setForm({ ...form, resultMode: e.target.value })}
                      className="sr-only"
                    />
                    <span className="font-medium text-sm text-gray-900">{mode.label}</span>
                    <span className="text-xs text-gray-500">{mode.desc}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => {
                if (!form.title || !form.startTime || !form.endTime) {
                  setError('Please fill in all required fields')
                  return
                }
                setError(null)
                setStep(2)
              }}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Next: Select Questions →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Question Selection */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Select Questions</h2>
            <span className="text-sm text-gray-500">
              {selectedQuestions.length} selected · {totalMarks} total marks
            </span>
          </div>

          {questions.length === 0 ? (
            <div className="py-10 text-center text-gray-400">
              <p>No questions found for this assignment.</p>
              <a
                href={
                  selectedAssignment
                    ? `/teacher/questions/${selectedAssignment.academicYearId}/${selectedAssignment.subjectId}/${selectedAssignment.languageId}`
                    : '/teacher/questions'
                }
                className="text-blue-600 hover:underline text-sm mt-2 inline-block"
              >
                Create questions first →
              </a>
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {questions.map((q) => {
                const selected = isSelected(q.id)
                const sq = selectedQuestions.find((s) => s.questionId === q.id)
                return (
                  <div
                    key={q.id}
                    className={`border-2 rounded-xl p-4 cursor-pointer transition ${
                      selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => toggleQuestion(q)}
                  >
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={selected} readOnly className="mt-0.5 w-4 h-4" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                            {q.type.replace('_', ' ')}
                          </span>
                          {q.difficulty && (
                            <span className="text-xs text-gray-400 capitalize">{q.difficulty}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-900 line-clamp-2">{q.text}</p>
                      </div>
                      {selected && (
                        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                          <label className="text-xs text-gray-500 block mb-0.5">Marks</label>
                          <input
                            type="number"
                            min={1}
                            value={sq?.marks ?? q.marks}
                            onChange={(e) => updateQuestionMarks(q.id, parseInt(e.target.value))}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center outline-none focus:border-blue-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
              ← Back
            </button>
            <button
              onClick={() => {
                if (selectedQuestions.length === 0) { setError('Select at least one question'); return }
                setError(null); setStep(3)
              }}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Next: Settings →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Settings & Publish */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="font-semibold text-gray-900">Exam Settings</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instructions for Students</label>
            <textarea
              value={form.instructions}
              onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-blue-500"
              rows={3}
              placeholder="Optional instructions shown to students before starting..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'autoPublish', label: 'Auto-publish result', desc: 'Publish automatically after exam completion' },
              { key: 'allowRetake', label: 'Allow retake', desc: 'Students can attempt again' },
              { key: 'showAnswers', label: 'Show correct answers', desc: 'Students see answers after result' },
              { key: 'showMarks', label: 'Show marks per question', desc: 'Students see individual marks' },
            ].map((item) => (
              <label key={item.key} className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:border-gray-300">
                <input
                  type="checkbox"
                  checked={form[item.key as keyof typeof form] as boolean}
                  onChange={(e) => setForm({ ...form, [item.key]: e.target.checked })}
                  className="mt-0.5 w-4 h-4 text-blue-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-4 text-sm">
            <h3 className="font-semibold text-gray-900 mb-2">Exam Summary</h3>
            <div className="grid grid-cols-2 gap-2 text-gray-600">
              <span>Title:</span><span className="font-medium text-gray-900">{form.title}</span>
              <span>Questions:</span><span className="font-medium text-gray-900">{selectedQuestions.length}</span>
              <span>Total Marks:</span><span className="font-medium text-gray-900">{totalMarks}</span>
              <span>Passing Marks:</span><span className="font-medium text-gray-900">{form.passingMarks}</span>
              <span>Duration:</span><span className="font-medium text-gray-900">{form.duration} min</span>
              <span>Result Mode:</span><span className="font-medium text-gray-900">{form.resultMode}</span>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Exam'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
