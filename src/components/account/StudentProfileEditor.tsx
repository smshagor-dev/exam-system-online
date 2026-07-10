'use client'

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type OptionItem = {
  id: string
  name: string
  academicYearId?: string | null
}

type RegistrationCustomField = {
  id: string
  label: string
  key: string
  type: 'TEXT' | 'CHECKBOX' | 'SELECT'
  isRequired: boolean
  placeholder?: string | null
  options?: string[] | null
}

type StudentProfileEditorProps = {
  title: string
  description: string
  initialUser: {
    name: string
    email: string
    role: string
    avatarUrl?: string | null
  }
  initialAcademic: {
    phone: string
    course: string
    departmentId: string
    subjectId: string
    languageId: string
    groupId: string
    academicYearId: string
    semesterId: string
    customFieldResponses: Record<string, string | boolean>
  }
  departments: OptionItem[]
  languages: OptionItem[]
  years: OptionItem[]
  semesters: OptionItem[]
  initialSubjects: OptionItem[]
  initialGroups: OptionItem[]
  initialCustomFields: RegistrationCustomField[]
}

function roleLabel(role: string) {
  return role.replace(/_/g, ' ')
}

function buildDefaultCustomFieldValues(
  fields: RegistrationCustomField[],
  previous?: Record<string, string | boolean>
) {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      previous?.[field.key] ?? (field.type === 'CHECKBOX' ? false : ''),
    ])
  )
}

export default function StudentProfileEditor({
  title,
  description,
  initialUser,
  initialAcademic,
  departments,
  languages,
  years,
  semesters,
  initialSubjects,
  initialGroups,
  initialCustomFields,
}: StudentProfileEditorProps) {
  const router = useRouter()
  const [name, setName] = useState(initialUser.name)
  const [phone, setPhone] = useState(initialAcademic.phone)
  const [course, setCourse] = useState(initialAcademic.course)
  const [departmentId, setDepartmentId] = useState(initialAcademic.departmentId)
  const [subjectId, setSubjectId] = useState(initialAcademic.subjectId)
  const [languageId, setLanguageId] = useState(initialAcademic.languageId)
  const [groupId, setGroupId] = useState(initialAcademic.groupId)
  const [academicYearId, setAcademicYearId] = useState(initialAcademic.academicYearId)
  const [semesterId, setSemesterId] = useState(initialAcademic.semesterId)
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | boolean>>(
    buildDefaultCustomFieldValues(initialCustomFields, initialAcademic.customFieldResponses)
  )
  const [subjects, setSubjects] = useState<OptionItem[]>(initialSubjects)
  const [groups, setGroups] = useState<OptionItem[]>(initialGroups)
  const [customFields, setCustomFields] = useState<RegistrationCustomField[]>(initialCustomFields)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialUser.avatarUrl ?? null)
  const [removeAvatar, setRemoveAvatar] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadingFields, setLoadingFields] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const previewUrl = useMemo(() => {
    if (avatarFile) return URL.createObjectURL(avatarFile)
    if (removeAvatar) return null
    return avatarUrl
  }, [avatarFile, avatarUrl, removeAvatar])

  useEffect(() => {
    if (!avatarFile || !previewUrl || previewUrl === avatarUrl) return

    return () => {
      URL.revokeObjectURL(previewUrl)
    }
  }, [avatarFile, avatarUrl, previewUrl])

  async function loadSubjectsForDepartment(nextDepartmentId: string, nextSubjectId = '') {
    if (!nextDepartmentId) {
      setSubjects([])
      setSubjectId('')
      return
    }

    const data: OptionItem[] = await fetch(`/api/public/subjects?departmentId=${nextDepartmentId}`).then((response) => response.json())
    setSubjects(data)
    if (nextSubjectId && data.some((item) => item.id === nextSubjectId)) {
      setSubjectId(nextSubjectId)
      return
    }
    setSubjectId('')
  }

  async function loadGroupsForAcademicYear(nextAcademicYearId: string, nextGroupId = '') {
    if (!nextAcademicYearId) {
      setGroups([])
      setGroupId('')
      return
    }

    const data: OptionItem[] = await fetch(`/api/public/groups?academicYearId=${nextAcademicYearId}`).then((response) => response.json())
    setGroups(data)
    if (nextGroupId && data.some((item) => item.id === nextGroupId)) {
      setGroupId(nextGroupId)
      return
    }
    setGroupId('')
  }

  async function loadCustomFieldsForDepartment(nextDepartmentId: string, previousValues?: Record<string, string | boolean>) {
    if (!nextDepartmentId) {
      setCustomFields([])
      setCustomFieldValues({})
      return
    }

    setLoadingFields(true)
    try {
      const data: RegistrationCustomField[] = await fetch(`/api/public/registration-fields?departmentId=${nextDepartmentId}`).then((response) => response.json())
      setCustomFields(data)
      setCustomFieldValues(buildDefaultCustomFieldValues(data, previousValues))
    } finally {
      setLoadingFields(false)
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setAvatarFile(file)
    setRemoveAvatar(false)
    setError(null)
    setSuccess(null)
  }

  async function handleDepartmentChange(nextDepartmentId: string) {
    setDepartmentId(nextDepartmentId)
    setAcademicYearId('')
    setGroupId('')
    setLanguageId('')
    setSemesterId('')
    setSubjectId('')
    setGroups([])
    setError(null)
    setSuccess(null)

    await Promise.all([
      loadSubjectsForDepartment(nextDepartmentId),
      loadCustomFieldsForDepartment(nextDepartmentId),
    ])
  }

  async function handleAcademicYearChange(nextAcademicYearId: string) {
    setAcademicYearId(nextAcademicYearId)
    setGroupId('')
    setLanguageId('')
    setSemesterId('')
    setError(null)
    setSuccess(null)

    await loadGroupsForAcademicYear(nextAcademicYearId)
  }

  function handleGroupChange(nextGroupId: string) {
    setGroupId(nextGroupId)
    setLanguageId('')
    setSemesterId('')
    setError(null)
    setSuccess(null)
  }

  function handleLanguageChange(nextLanguageId: string) {
    setLanguageId(nextLanguageId)
    setSemesterId('')
    setError(null)
    setSuccess(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const formData = new FormData()
      formData.append('name', name)
      formData.append('removeAvatar', removeAvatar ? 'true' : 'false')
      formData.append(
        'studentProfile',
        JSON.stringify({
          phone,
          course,
          departmentId,
          subjectId,
          languageId,
          groupId,
          academicYearId,
          semesterId,
          customFieldResponses: customFieldValues,
        })
      )

      if (avatarFile) {
        formData.append('avatar', avatarFile)
      }

      const response = await fetch('/api/account/profile', {
        method: 'PATCH',
        body: formData,
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile')
      }

      setAvatarFile(null)
      setAvatarUrl(data.avatarUrl ?? null)
      setName(data.name)
      setPhone(data.studentProfile?.phone ?? phone)
      setCourse(data.studentProfile?.course ?? course)
      setRemoveAvatar(false)
      setSuccess('Profile updated successfully')
      router.refresh()
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to update profile')
    } finally {
      setSubmitting(false)
    }
  }

  const avatarInitial = name.trim().charAt(0).toUpperCase() || initialUser.email.charAt(0).toUpperCase()

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">{title}</p>
        <h1 className="text-2xl font-semibold text-slate-900">{description}</h1>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-8 lg:grid-cols-[280px,minmax(0,1fr)]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-col items-center text-center">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={name}
                className="h-28 w-28 rounded-full border border-slate-200 object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-sky-600 text-3xl font-semibold text-white shadow-sm">
                {avatarInitial}
              </div>
            )}

            <p className="mt-4 text-lg font-semibold text-slate-900">{name}</p>
            <p className="text-sm text-slate-500">{initialUser.email}</p>
            <div className="mt-3 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm">
              {roleLabel(initialUser.role)}
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium text-slate-700">
              Profile image
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-sky-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-sky-700"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setAvatarFile(null)
                setRemoveAvatar(true)
                setSuccess(null)
                setError(null)
              }}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Remove image
            </button>
            <p className="text-xs text-slate-500">Use JPG, PNG, WEBP, or GIF up to 2MB.</p>
          </div>
        </div>

        <div className="space-y-8">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Full name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                placeholder="Enter your name"
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Phone
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                placeholder="Enter your phone"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700 md:col-span-2">
              Email address
              <input
                type="email"
                value={initialUser.email}
                disabled
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500"
              />
            </label>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Academic Information</h2>
              <p className="mt-1 text-sm text-slate-500">All registration-time academic fields can be updated from here.</p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Course
                <select
                  value={course}
                  onChange={(event) => setCourse(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  required
                >
                  <option value="">Select...</option>
                  <option value="BACHELOR_OF_SCIENCE">Bachelor of Science</option>
                  <option value="MASTER_OF_SCIENCE">Master of Science</option>
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Department
                <select
                  value={departmentId}
                  onChange={(event) => void handleDepartmentChange(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  required
                >
                  <option value="">Select...</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Academic Year
                <select
                  value={academicYearId}
                  onChange={(event) => void handleAcademicYearChange(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  required
                >
                  <option value="">Select...</option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Group
                <select
                  value={groupId}
                  onChange={(event) => handleGroupChange(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  required
                  disabled={!academicYearId}
                >
                  <option value="">Select...</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Department Language
                <select
                  value={languageId}
                  onChange={(event) => handleLanguageChange(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  required
                  disabled={!groupId}
                >
                  <option value="">Select...</option>
                  {languages.map((language) => (
                    <option key={language.id} value={language.id}>
                      {language.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Semester
                <select
                  value={semesterId}
                  onChange={(event) => setSemesterId(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  required
                  disabled={!languageId}
                >
                  <option value="">Select...</option>
                  {semesters.map((semester) => (
                    <option key={semester.id} value={semester.id}>
                      {semester.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                Subject
                <select
                  value={subjectId}
                  onChange={(event) => setSubjectId(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                  required
                  disabled={!departmentId || !semesterId}
                >
                  <option value="">Select...</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Additional Department Fields</h2>
              <p className="mt-1 text-sm text-slate-500">These follow the dynamic registration fields configured for your department.</p>
            </div>

            {loadingFields ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">Loading department fields...</div>
            ) : customFields.length > 0 ? (
              <div className="grid gap-5">
                {customFields.map((field) => (
                  <div key={field.id}>
                    {field.type === 'CHECKBOX' ? (
                      <label className="inline-flex items-start gap-3 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={customFieldValues[field.key] === true}
                          onChange={(event) =>
                            setCustomFieldValues((current) => ({
                              ...current,
                              [field.key]: event.target.checked,
                            }))
                          }
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span>
                          <span className="font-medium text-slate-900">
                            {field.label}
                            {field.isRequired ? ' *' : ''}
                          </span>
                          {field.placeholder ? <span className="mt-1 block text-xs text-slate-500">{field.placeholder}</span> : null}
                        </span>
                      </label>
                    ) : field.type === 'SELECT' ? (
                      <label className="block text-sm font-medium text-slate-700">
                        {field.label}
                        {field.isRequired ? ' *' : ''}
                        <select
                          value={String(customFieldValues[field.key] ?? '')}
                          onChange={(event) =>
                            setCustomFieldValues((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                          required={field.isRequired}
                        >
                          <option value="">Select...</option>
                          {(field.options ?? []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="block text-sm font-medium text-slate-700">
                        {field.label}
                        {field.isRequired ? ' *' : ''}
                        <input
                          type="text"
                          value={String(customFieldValues[field.key] ?? '')}
                          onChange={(event) =>
                            setCustomFieldValues((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
                          placeholder={field.placeholder ?? 'Enter your answer'}
                          required={field.isRequired}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
                No extra academic fields are configured for this department.
              </div>
            )}
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-2xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}
