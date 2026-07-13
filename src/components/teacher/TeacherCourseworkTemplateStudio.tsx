'use client'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

type ScopeOption = {
  academicOfferingId: string | null
  subjectId: string
  subjectName: string
  languageId: string
  languageName: string
  groupId: string
  groupName: string
  academicYearId: string
  academicYearName: string
  semesterId: string
  semesterName: string
}

type ExistingTemplate = {
  id: string
  type: string
  visibility: string
  title: string
  description: string | null
  instructions: string | null
  allowedFileTypes: string[]
  maxAttempts: number | null
  allowUnlimitedAttempts: boolean
  latePolicyType: string
  subjectName: string
  languageName: string
  groupName: string | null
  academicYearName: string | null
  semesterName: string | null
  rubric: {
    title: string
    totalMarks: number
    criteria: Array<{
      title: string
      maximumMarks: number
      weight: number
    }>
  } | null
}

type Props = {
  scopeOptions: ScopeOption[]
  templates: ExistingTemplate[]
}

type RubricCriterionDraft = {
  title: string
  description: string
  maximumMarks: string
  weight: string
}

const templateTypes = [
  'HOMEWORK',
  'LAB',
  'PROJECT',
  'RESEARCH',
  'ESSAY',
  'PRESENTATION',
  'QUIZ',
  'PRACTICAL',
  'PROGRAMMING_ASSIGNMENT',
  'CAPSTONE',
]

export default function TeacherCourseworkTemplateStudio({ scopeOptions, templates }: Props) {
  const router = useRouter()
  const [scopeKey, setScopeKey] = useState(scopeOptions[0] ? `${scopeOptions[0].subjectId}:${scopeOptions[0].languageId}:${scopeOptions[0].groupId}:${scopeOptions[0].academicYearId}:${scopeOptions[0].semesterId}` : '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [templateType, setTemplateType] = useState('HOMEWORK')
  const [allowedFileTypes, setAllowedFileTypes] = useState('pdf, docx, txt')
  const [maxAttempts, setMaxAttempts] = useState('1')
  const [allowUnlimitedAttempts, setAllowUnlimitedAttempts] = useState(false)
  const [latePolicyType, setLatePolicyType] = useState('NO_LATE_SUBMISSION')
  const [rubricTitle, setRubricTitle] = useState('Default Rubric')
  const [criteria, setCriteria] = useState<RubricCriterionDraft[]>([
    { title: 'Quality', description: '', maximumMarks: '100', weight: '1' },
  ])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedScope = useMemo(
    () =>
      scopeOptions.find(
        (scope) =>
          `${scope.subjectId}:${scope.languageId}:${scope.groupId}:${scope.academicYearId}:${scope.semesterId}` === scopeKey
      ) ?? scopeOptions[0],
    [scopeKey, scopeOptions]
  )

  async function handleCreateTemplate() {
    if (!selectedScope) {
      setError('Select a valid scope first.')
      return
    }

    setSaving(true)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch('/api/teacher/coursework/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academicOfferingId: selectedScope.academicOfferingId,
          subjectId: selectedScope.subjectId,
          languageId: selectedScope.languageId,
          groupId: selectedScope.groupId,
          academicYearId: selectedScope.academicYearId,
          semesterId: selectedScope.semesterId,
          type: templateType,
          title,
          description,
          instructions,
          allowedFileTypes: allowedFileTypes.split(',').map((item) => item.trim()).filter(Boolean),
          maxAttempts: allowUnlimitedAttempts ? null : Number(maxAttempts) || 1,
          allowUnlimitedAttempts,
          latePolicyType,
          rubric: {
            title: rubricTitle,
            criteria: criteria.map((criterion) => ({
              title: criterion.title,
              description: criterion.description,
              maximumMarks: Number(criterion.maximumMarks) || 0,
              weight: Number(criterion.weight) || 1,
            })),
          },
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create coursework template')
      }

      setMessage('Coursework template created.')
      setTitle('')
      setDescription('')
      setInstructions('')
      router.refresh()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to create coursework template')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr),minmax(340px,0.8fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Create Enterprise Template</h2>
          <p className="mt-1 text-sm text-slate-500">Build reusable coursework templates with rubric rules and submission policy.</p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Scope
              <select value={scopeKey} onChange={(event) => setScopeKey(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                {scopeOptions.map((scope) => (
                  <option
                    key={`${scope.subjectId}:${scope.languageId}:${scope.groupId}:${scope.academicYearId}:${scope.semesterId}`}
                    value={`${scope.subjectId}:${scope.languageId}:${scope.groupId}:${scope.academicYearId}:${scope.semesterId}`}
                  >
                    {scope.subjectName} | {scope.languageName} | {scope.groupName}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Template Type
              <select value={templateType} onChange={(event) => setTemplateType(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                {templateTypes.map((item) => (
                  <option key={item} value={item}>
                    {item.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Title
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="Programming project template" />
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Description
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Allowed File Types
              <input value={allowedFileTypes} onChange={(event) => setAllowedFileTypes(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="pdf, docx, zip" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Late Policy
              <select value={latePolicyType} onChange={(event) => setLatePolicyType(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm">
                <option value="NO_LATE_SUBMISSION">No late submission</option>
                <option value="GRACE_PERIOD">Grace period</option>
                <option value="LATE_WITHOUT_PENALTY">Late without penalty</option>
                <option value="LATE_WITH_PENALTY">Late with penalty</option>
                <option value="HARD_CLOSE">Hard close</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Maximum Attempts
              <input value={maxAttempts} onChange={(event) => setMaxAttempts(event.target.value)} disabled={allowUnlimitedAttempts} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm disabled:bg-slate-100" />
            </label>
            <label className="mt-8 flex items-center gap-3 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={allowUnlimitedAttempts} onChange={(event) => setAllowUnlimitedAttempts(event.target.checked)} />
              Unlimited attempts
            </label>
          </div>

          <label className="mt-6 block text-sm font-medium text-slate-700">
            Instructions
            <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={8} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="Write multilingual-friendly instructions here" />
          </label>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">Rubric Builder</h3>
                <p className="text-sm text-slate-500">Add criteria, marks, and weights for grading.</p>
              </div>
              <button type="button" onClick={() => setCriteria((current) => [...current, { title: '', description: '', maximumMarks: '0', weight: '1' }])} className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
                Add Criterion
              </button>
            </div>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Rubric Title
              <input value={rubricTitle} onChange={(event) => setRubricTitle(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm" />
            </label>
            <div className="mt-4 space-y-3">
              {criteria.map((criterion, index) => (
                <div key={`${criterion.title}-${index}`} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-4">
                  <input value={criterion.title} onChange={(event) => setCriteria((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="Criterion title" />
                  <input value={criterion.description} onChange={(event) => setCriteria((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="Description" />
                  <input value={criterion.maximumMarks} onChange={(event) => setCriteria((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, maximumMarks: event.target.value } : item))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="Marks" />
                  <input value={criterion.weight} onChange={(event) => setCriteria((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, weight: event.target.value } : item))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm" placeholder="Weight" />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button type="button" onClick={() => void handleCreateTemplate()} disabled={saving} className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60">
              {saving ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Existing Templates</h2>
          <div className="mt-4 space-y-4">
            {templates.length === 0 ? <p className="text-sm text-slate-500">No enterprise templates created yet.</p> : null}
            {templates.map((template) => (
              <div key={template.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{template.title}</h3>
                    <p className="text-sm text-slate-500">
                      {template.subjectName} | {template.languageName} | {template.groupName ?? 'No group'}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{template.type.replaceAll('_', ' ')}</span>
                </div>
                <p className="mt-3 text-sm text-slate-600">{template.description || 'No description provided.'}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1">{template.allowedFileTypes.join(', ')}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1">{template.allowUnlimitedAttempts ? 'Unlimited attempts' : `${template.maxAttempts ?? 1} attempts`}</span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1">{template.latePolicyType.replaceAll('_', ' ')}</span>
                </div>
                {template.rubric ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">{template.rubric.title}</p>
                    <p className="mt-1 text-xs text-slate-500">Total marks: {template.rubric.totalMarks}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
