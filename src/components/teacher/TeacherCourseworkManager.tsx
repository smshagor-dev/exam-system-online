'use client'

import { formatCourseworkDeadline, formatCourseworkStatus, isCourseworkDeadlinePassed } from '@/lib/coursework'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

type ScopeOption = {
  departmentName: string
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

type CourseworkRuleRecord = {
  id: string
  subjectId: string
  languageId: string
  groupId: string
  academicYearId: string
  semesterId: string
  rules: string
  useAiValidation: boolean
  submissionDeadline: string | null
}

type StudentRow = {
  id: string
  name: string
  email: string
  scopes: ScopeOption[]
  courseworkAssignments: Array<{
    id: string
    title: string
    subjectId: string
    languageId: string
    groupId: string
    academicYearId: string
    semesterId: string
    latestSubmission: {
      status: 'PENDING' | 'ACCEPTED' | 'REJECTED'
      aiFeedback: string | null
      createdAt: string
    } | null
  }>
}

type Props = {
  scopeOptions: ScopeOption[]
  rules: CourseworkRuleRecord[]
  students: StudentRow[]
  aiSettings: {
    enabled: boolean
    providerLabel: string | null
  }
}

function statusClasses(status: 'PENDING' | 'ACCEPTED' | 'REJECTED') {
  if (status === 'ACCEPTED') return 'bg-emerald-100 text-emerald-700'
  if (status === 'REJECTED') return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-700'
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const timezoneOffset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16)
}

export default function TeacherCourseworkManager({ scopeOptions, rules, students, aiSettings }: Props) {
  const router = useRouter()
  const [academicYearId, setAcademicYearId] = useState(scopeOptions[0]?.academicYearId ?? '')
  const [semesterId, setSemesterId] = useState(scopeOptions.find((scope) => scope.academicYearId === (scopeOptions[0]?.academicYearId ?? ''))?.semesterId ?? '')
  const [groupId, setGroupId] = useState('')
  const [languageId, setLanguageId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [titleDrafts, setTitleDrafts] = useState<Record<string, string>>({})
  const [rulesDrafts, setRulesDrafts] = useState<Record<string, string>>({})
  const [deadlineDrafts, setDeadlineDrafts] = useState<Record<string, string>>({})
  const [aiValidationDrafts, setAiValidationDrafts] = useState<Record<string, boolean>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [rulesSaving, setRulesSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filteredByYear = useMemo(
    () => scopeOptions.filter((scope) => !academicYearId || scope.academicYearId === academicYearId),
    [scopeOptions, academicYearId]
  )
  const filteredBySemester = useMemo(
    () => filteredByYear.filter((scope) => !semesterId || scope.semesterId === semesterId),
    [filteredByYear, semesterId]
  )
  const filteredByGroup = useMemo(
    () => filteredBySemester.filter((scope) => !groupId || scope.groupId === groupId),
    [filteredBySemester, groupId]
  )
  const filteredByLanguage = useMemo(
    () => filteredByGroup.filter((scope) => !languageId || scope.languageId === languageId),
    [filteredByGroup, languageId]
  )

  const matchingStudents = useMemo(() => {
    return students.filter((student) =>
      student.scopes.some(
        (scope) =>
          (!academicYearId || scope.academicYearId === academicYearId) &&
          (!semesterId || scope.semesterId === semesterId) &&
          (!groupId || scope.groupId === groupId) &&
          (!languageId || scope.languageId === languageId) &&
          (!subjectId || scope.subjectId === subjectId)
      )
    )
  }, [students, academicYearId, semesterId, groupId, languageId, subjectId])

  function getScopedAssignment(student: StudentRow) {
    return student.courseworkAssignments.find(
      (assignment) =>
        assignment.academicYearId === academicYearId &&
        assignment.semesterId === semesterId &&
        assignment.groupId === groupId &&
        assignment.languageId === languageId &&
        assignment.subjectId === subjectId
    )
  }

  const currentScopeKey = [academicYearId, semesterId, groupId, languageId, subjectId].join(':')

  const currentRule = rules.find(
    (rule) =>
      rule.academicYearId === academicYearId &&
      rule.semesterId === semesterId &&
      rule.groupId === groupId &&
      rule.languageId === languageId &&
      rule.subjectId === subjectId
  )

  const sharedRules = rulesDrafts[currentScopeKey] ?? currentRule?.rules ?? ''
  const deadlineValue = deadlineDrafts[currentScopeKey] ?? toDateTimeLocalValue(currentRule?.submissionDeadline ?? null)
  const useAiValidation = aiValidationDrafts[currentScopeKey] ?? currentRule?.useAiValidation ?? false
  const hasSavedRule = Boolean(currentRule)
  const sharedRulesTooShort = sharedRules.trim().length < 10

  function getTitleDraft(student: StudentRow) {
    const existing = getScopedAssignment(student)
    return titleDrafts[student.id] ?? existing?.title ?? ''
  }

  async function handleSaveRules() {
    if (sharedRulesTooShort) {
      setMessage(null)
      setError('Rules must be at least 10 characters long before saving.')
      return
    }

    if (useAiValidation && !aiSettings.enabled) {
      setMessage(null)
      setError('Enable Teacher AI Settings first before turning on rule-wise AI checking.')
      return
    }

    setRulesSaving(true)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch('/api/coursework/rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subjectId,
          languageId,
          groupId,
          academicYearId,
          semesterId,
          rules: sharedRules,
          useAiValidation,
          submissionDeadline: deadlineValue || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save coursework rules')
      }

      setMessage(`Saved shared coursework rules${useAiValidation ? ' with AI checking' : ''} and deadline.`)
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save coursework rules')
    } finally {
      setRulesSaving(false)
    }
  }

  async function handleSaveTitle(student: StudentRow) {
    const title = getTitleDraft(student).trim()

    if (!hasSavedRule) {
      setMessage(null)
      setError('Save the shared rules first. তারপর student title save/update করতে পারবেন.')
      return
    }

    if (title.length < 2) {
      setMessage(null)
      setError(`Enter a title for ${student.name} before saving.`)
      return
    }

    setSavingId(student.id)
    setMessage(null)
    setError(null)

    try {
      const response = await fetch('/api/coursework/assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          studentId: student.id,
          subjectId,
          languageId,
          groupId,
          academicYearId,
          semesterId,
          title: getTitleDraft(student),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign coursework title')
      }

      setMessage(`Saved title for ${student.name}.`)
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to assign coursework title')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Create Course Work & Report</h1>
        <p className="mt-1 text-sm text-slate-500">
          Save shared rules and deadline once for the selected scope, then assign a custom title to each student.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-6">
          <label className="text-sm font-medium text-slate-700">
            Department
            <input
              type="text"
              value={scopeOptions[0]?.departmentName ?? ''}
              readOnly
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Academic Year
            <select
              value={academicYearId}
              onChange={(event) => {
                setAcademicYearId(event.target.value)
                setSemesterId('')
                setGroupId('')
                setLanguageId('')
                setSubjectId('')
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              {[...new Map(scopeOptions.map((scope) => [scope.academicYearId, scope])).values()].map((scope) => (
                <option key={scope.academicYearId} value={scope.academicYearId}>
                  {scope.academicYearName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Semester
            <select
              value={semesterId}
              onChange={(event) => {
                setSemesterId(event.target.value)
                setGroupId('')
                setLanguageId('')
                setSubjectId('')
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select semester</option>
              {[...new Map(filteredByYear.map((scope) => [scope.semesterId, scope])).values()].map((scope) => (
                <option key={scope.semesterId} value={scope.semesterId}>
                  {scope.semesterName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Group
            <select
              value={groupId}
              onChange={(event) => {
                setGroupId(event.target.value)
                setLanguageId('')
                setSubjectId('')
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select group</option>
              {[...new Map(filteredBySemester.map((scope) => [scope.groupId, scope])).values()].map((scope) => (
                <option key={scope.groupId} value={scope.groupId}>
                  {scope.groupName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Department Language
            <select
              value={languageId}
              onChange={(event) => {
                setLanguageId(event.target.value)
                setSubjectId('')
              }}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select language</option>
              {[...new Map(filteredByGroup.map((scope) => [scope.languageId, scope])).values()].map((scope) => (
                <option key={scope.languageId} value={scope.languageId}>
                  {scope.languageName}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700">
            Subject
            <select
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select subject</option>
              {[...new Map(filteredByLanguage.map((scope) => [scope.subjectId, scope])).values()].map((scope) => (
                <option key={scope.subjectId} value={scope.subjectId}>
                  {scope.subjectName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {message ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {!subjectId ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center text-sm text-slate-500">
          Select year, semester, group, language, and subject to create coursework rules and titles.
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-semibold text-slate-900">Shared Rules</h2>
              <p className="mt-1 text-sm text-slate-500">These rules and deadline apply to every assigned student in this selected scope.</p>
            </div>

            <div className="space-y-5 px-6 py-5">
              <label className="block text-sm font-medium text-slate-700">
                Coursework Rules
                <textarea
                  rows={6}
                  value={sharedRules}
                  onChange={(event) =>
                    setRulesDrafts((current) => ({
                      ...current,
                      [currentScopeKey]: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  placeholder="Write the shared coursework and report rules for this scope"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-[minmax(0,280px),1fr] md:items-end">
                <label className="block text-sm font-medium text-slate-700">
                  Submission Deadline
                  <input
                    type="datetime-local"
                    value={deadlineValue}
                    onChange={(event) =>
                      setDeadlineDrafts((current) => ({
                        ...current,
                        [currentScopeKey]: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  />
                </label>

                <div className="space-y-3">
                  <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={useAiValidation}
                      onChange={(event) =>
                        setAiValidationDrafts((current) => ({
                          ...current,
                          [currentScopeKey]: event.target.checked,
                        }))
                      }
                      disabled={!aiSettings.enabled}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm text-slate-700">
                      <span className="block font-medium text-slate-900">Check submission with AI using these rules</span>
                      <span className="block text-xs text-slate-500">
                        {aiSettings.enabled
                          ? `Teacher AI Settings are active${aiSettings.providerLabel ? ` with ${aiSettings.providerLabel}` : ''}.`
                          : 'Teacher AI Settings are off. Turn them on first to use rule-wise AI checking.'}
                      </span>
                    </span>
                  </label>

                  <div className="flex flex-col gap-2 md:items-end">
                  <button
                    type="button"
                    onClick={() => void handleSaveRules()}
                    disabled={rulesSaving}
                    className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {rulesSaving ? (hasSavedRule ? 'Updating Rules...' : 'Saving Rules...') : hasSavedRule ? 'Update Rules' : 'Save Rules'}
                  </button>
                  {sharedRulesTooShort ? (
                    <p className="text-xs text-amber-600">Write at least 10 characters in rules to save this scope.</p>
                  ) : null}
                  <p className="text-xs text-slate-400">
                    {currentRule
                      ? `Saved deadline: ${formatCourseworkDeadline(currentRule.submissionDeadline)} | AI check: ${currentRule.useAiValidation ? 'On' : 'Off'}`
                      : 'No saved rules yet for this scope.'}
                  </p>
                </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-xl font-semibold text-slate-900">Assign Titles to Students</h2>
              <p className="mt-1 text-sm text-slate-500">Each student gets a specific title, but all of them follow the same rules above.</p>
            </div>

            {matchingStudents.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No students found in the selected scope.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {matchingStudents.map((student) => {
                  const scopedAssignment = getScopedAssignment(student)
                  const latestSubmission = scopedAssignment?.latestSubmission ?? null

                  return (
                    <div key={student.id} className="grid gap-4 px-6 py-5 lg:grid-cols-[240px,minmax(0,1fr)]">
                      <div>
                        <p className="font-semibold text-slate-900">{student.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{student.email}</p>
                        {latestSubmission ? (
                          <div className="mt-3 space-y-2">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(latestSubmission.status)}`}>
                              {formatCourseworkStatus(latestSubmission.status)}
                            </span>
                            <p className="text-xs text-slate-400">
                              Latest submission: {new Date(latestSubmission.createdAt).toLocaleDateString()}
                            </p>
                            {latestSubmission.aiFeedback ? <p className="text-xs text-rose-600">{latestSubmission.aiFeedback}</p> : null}
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-slate-400">No submission yet</p>
                        )}
                        {currentRule?.submissionDeadline ? (
                          <p className={`mt-2 text-xs ${isCourseworkDeadlinePassed(currentRule.submissionDeadline) ? 'text-rose-600' : 'text-slate-400'}`}>
                            Deadline: {formatCourseworkDeadline(currentRule.submissionDeadline)}
                          </p>
                        ) : null}
                      </div>

                      <div className="space-y-3">
                        <input
                          type="text"
                          value={getTitleDraft(student)}
                          onChange={(event) =>
                            setTitleDrafts((current) => ({
                              ...current,
                              [student.id]: event.target.value,
                            }))
                          }
                          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                          placeholder="Write the title for this student"
                        />
                        {!hasSavedRule ? (
                          <p className="text-xs text-amber-600">Save shared rules first, then this title can be saved.</p>
                        ) : getTitleDraft(student).trim().length < 2 ? (
                          <p className="text-xs text-amber-600">Title needs at least 2 characters.</p>
                        ) : null}
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => void handleSaveTitle(student)}
                            disabled={savingId === student.id}
                            className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingId === student.id ? 'Saving...' : scopedAssignment ? 'Update Title' : 'Save Title'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
