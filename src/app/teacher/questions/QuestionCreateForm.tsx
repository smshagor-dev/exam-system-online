'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import RichTextEditor from '@/components/editor/RichTextEditor'
import { CodeEditor } from '@/components/code/CodeEditor'
import { CODE_LANGUAGES } from '@/lib/question-code'

type Assignment = {
  id: string
  subject: { id: string; name: string }
  language: { id: string; name: string; code?: string }
  group: { id: string; name: string }
  academicYear: { id: string; name: string }
  semester: { id: string; name: string }
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

function isRichTextEmpty(html: string) {
  return stripHtml(html).length === 0
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export default function QuestionCreateForm({
  assignments,
  backHref,
}: {
  assignments: Assignment[]
  backHref: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extractedText, setExtractedText] = useState('')
  const defaultAssignmentId = assignments[0]?.id ?? ''

  const createInitialFormState = () => ({
    assignmentId: defaultAssignmentId,
    type: 'MCQ',
    text: '',
    marks: 2,
    difficulty: 'medium',
    expectedAnswer: '',
    keywords: '',
    explanation: '',
    contentMode: 'TEXT' as 'TEXT' | 'TEXT_CODE',
    codeContent: '',
    codeLanguage: 'cpp',
    answerMode: 'TEXT' as 'TEXT' | 'CODE',
    answerCodeLanguage: 'cpp',
    answerStarterCode: '',
    options: [
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
    ],
  })
  const [form, setForm] = useState(createInitialFormState)

  const selectedAssignment = assignments.find((assignment) => assignment.id === form.assignmentId)
  const needsOptions = form.type === 'MCQ' || form.type === 'TRUE_FALSE'
  const optionCount = form.type === 'TRUE_FALSE' ? 2 : 4

  const handleExtractAndInsert = async () => {
    if (!uploadFile) {
      setExtractError('Please choose a file first')
      return
    }

    setExtracting(true)
    setExtractError(null)

    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      if (selectedAssignment?.language.code) {
        formData.append('ocrLanguage', selectedAssignment.language.code)
      } else if (selectedAssignment?.language.name) {
        formData.append('ocrLanguage', selectedAssignment.language.name)
      }

      const res = await fetch('/api/questions/extract', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to extract text')

      const nextText = String(data.text || '').trim()
      setExtractedText(nextText)
      const extractedHtml = textToHtml(nextText)
      setForm((prev) => ({
        ...prev,
        text: isRichTextEmpty(prev.text) ? extractedHtml : `${prev.text}${extractedHtml}`,
      }))
    } catch (err: unknown) {
      setExtractError(err instanceof Error ? err.message : 'Failed to extract text')
    } finally {
      setExtracting(false)
    }
  }

  const handleOptionChange = (
    index: number,
    field: 'text' | 'isCorrect',
    value: string | boolean,
  ) => {
    const nextOptions = [...form.options]
    nextOptions[index] = { ...nextOptions[index], [field]: value }

    if (field === 'isCorrect' && value === true) {
      nextOptions.forEach((option, optionIndex) => {
        if (optionIndex !== index) nextOptions[optionIndex] = { ...option, isCorrect: false }
      })
    }
    setForm({ ...form, options: nextOptions })
  }

  const resetForNextQuestion = () => {
    setForm(createInitialFormState())
    setUploadFile(null)
    setExtractError(null)
    setExtractedText('')
  }

  const submitQuestion = async (stayOnPage: boolean) => {
    if (!selectedAssignment) return

    if (isRichTextEmpty(form.text)) {
      setError('Question text is required')
      return
    }
    if (form.contentMode === 'TEXT_CODE' && !form.codeContent.trim()) {
      setError('Question code is required for Text + Code mode')
      return
    }

    setLoading(true)
    setError(null)
    setSuccessMessage(null)

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
      keywords: form.keywords
        ? form.keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean)
        : [],
      explanation: form.explanation || null,
      contentMode: form.contentMode,
      codeContent: form.contentMode === 'TEXT_CODE' ? form.codeContent : '',
      codeLanguage: form.codeLanguage,
      answerMode: form.answerMode,
      answerCodeLanguage: form.answerCodeLanguage,
      answerStarterCode: form.answerMode === 'CODE' ? form.answerStarterCode : '',
      options:
        form.type === 'MCQ' || form.type === 'TRUE_FALSE'
          ? form.options
              .filter((option) => option.text.trim())
              .map((option, index) => ({
                text: option.text,
                isCorrect: option.isCorrect,
                orderIndex: index,
              }))
          : [],
    }

    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        const message = typeof data.error === 'string' ? data.error : 'Failed to create question'
        throw new Error(message)
      }

      if (stayOnPage) {
        resetForNextQuestion()
        setSuccessMessage('Question created. You can add another one now.')
      } else {
        router.push(backHref)
        router.refresh()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create question')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await submitQuestion(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create New Question</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create normal text questions or programming questions with syntax-highlighted code.
          </p>
          {selectedAssignment && (
            <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              {selectedAssignment.subject.name} | {selectedAssignment.group.name} | {selectedAssignment.academicYear.name} | {selectedAssignment.semester.name} | {selectedAssignment.language.name}
            </div>
          )}
        </div>
        <Link href={backHref} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Back to Question Bank
        </Link>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {successMessage && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{successMessage}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Upload Source File</label>
                <input
                  type="file"
                  accept=".txt,.md,.pdf,image/*"
                  onChange={(event) => {
                    setUploadFile(event.target.files?.[0] ?? null)
                    setExtractError(null)
                  }}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                />
                <p className="mt-2 text-xs text-gray-500">Image, PDF, TXT and MD can still be extracted into the question text editor.</p>
              </div>
              <button type="button" onClick={handleExtractAndInsert} disabled={!uploadFile || extracting} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {extracting ? 'Extracting...' : 'Extract & Insert'}
              </button>
            </div>
            {extractError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{extractError}</div>}
            {extractedText && <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600">{extractedText}</pre>}
          </div>

          <input type="hidden" value={form.assignmentId} readOnly />

          <div className="grid gap-4 lg:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Question Type *</span>
              <select
                value={form.type}
                onChange={(event) => {
                  const nextType = event.target.value
                  setForm((prev) => ({
                    ...prev,
                    type: nextType,
                    answerMode: nextType === 'WRITTEN_ANSWER' ? prev.answerMode : 'TEXT',
                  }))
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                {QUESTION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Question Content *</span>
              <select
                value={form.contentMode}
                onChange={(event) => setForm({ ...form, contentMode: event.target.value as 'TEXT' | 'TEXT_CODE' })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="TEXT">Text</option>
                <option value="TEXT_CODE">Text + Code</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Answer Mode *</span>
              <select
                value={form.answerMode}
                onChange={(event) => {
                  const answerMode = event.target.value as 'TEXT' | 'CODE'
                  setForm((prev) => ({
                    ...prev,
                    answerMode,
                    type: answerMode === 'CODE' ? 'WRITTEN_ANSWER' : prev.type,
                  }))
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="TEXT">Text</option>
                <option value="CODE">Code Editor</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 md:max-w-md">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Marks *</span>
              <input type="number" min={1} value={form.marks} onChange={(event) => setForm({ ...form, marks: Number(event.target.value) })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Difficulty</span>
              <select value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
              </select>
            </label>
          </div>

          <RichTextEditor label="Question Text *" value={form.text} onChange={(value) => setForm({ ...form, text: value })} placeholder="Enter the question statement here..." />

          {form.contentMode === 'TEXT_CODE' && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">Question Code</h3>
                  <p className="text-xs text-slate-500">Students will see this code in a syntax-highlighted read-only block.</p>
                </div>
                <label className="block min-w-48">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Language</span>
                  <select value={form.codeLanguage} onChange={(event) => setForm({ ...form, codeLanguage: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    {CODE_LANGUAGES.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
                  </select>
                </label>
              </div>
              <CodeEditor value={form.codeContent} onChange={(codeContent) => setForm({ ...form, codeContent })} language={form.codeLanguage} label="Question Code" placeholder="Paste or write the code shown in the question..." />
            </div>
          )}

          {needsOptions && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Options * <span className="font-normal text-gray-400">(select the correct answer)</span></label>
              <div className="space-y-2">
                {Array.from({ length: optionCount }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <input type="checkbox" checked={form.options[index]?.isCorrect ?? false} onChange={(event) => handleOptionChange(index, 'isCorrect', event.target.checked)} className="h-4 w-4 rounded text-blue-600" />
                    <input value={form.options[index]?.text ?? ''} onChange={(event) => handleOptionChange(index, 'text', event.target.value)} placeholder={form.type === 'TRUE_FALSE' ? (index === 0 ? 'True' : 'False') : `Option ${index + 1}`} className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {form.answerMode === 'CODE' && (
            <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-sky-950">Student Code Answer</h3>
                  <p className="text-xs text-sky-700">The student will answer directly in the exam code editor. Code answers use Written Answer and teacher review.</p>
                </div>
                <label className="block min-w-48">
                  <span className="mb-1 block text-xs font-medium text-sky-800">Answer Language</span>
                  <select value={form.answerCodeLanguage} onChange={(event) => setForm({ ...form, answerCodeLanguage: event.target.value })} className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm">
                    {CODE_LANGUAGES.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
                  </select>
                </label>
              </div>
              <CodeEditor value={form.answerStarterCode} onChange={(answerStarterCode) => setForm({ ...form, answerStarterCode })} language={form.answerCodeLanguage} label="Starter Code (optional)" placeholder="Optional starter/template code for the student..." minHeight={220} />
              <CodeEditor value={form.expectedAnswer} onChange={(expectedAnswer) => setForm({ ...form, expectedAnswer })} language={form.answerCodeLanguage} label="Reference / Expected Code (optional)" placeholder="Optional reference solution for teacher review..." minHeight={220} />
            </div>
          )}

          {form.answerMode === 'TEXT' && form.type === 'SHORT_ANSWER' && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Expected Answer</span>
                <input value={form.expectedAnswer} onChange={(event) => setForm({ ...form, expectedAnswer: event.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Exact answer for auto-checking" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Keywords (comma-separated)</span>
                <input value={form.keywords} onChange={(event) => setForm({ ...form, keywords: event.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="keyword1, keyword2" />
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{loading ? 'Creating...' : 'Create Question'}</button>
            <button type="button" onClick={() => void submitQuestion(true)} disabled={loading} className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50">{loading ? 'Saving...' : 'Create & Add New'}</button>
            <Link href={backHref} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
