'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PasswordField } from '@/components/auth/PasswordField'
import { useI18n } from '@/components/i18n/LanguageProvider'

type FormStep = 1 | 2
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

export default function RegisterPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [branding, setBranding] = useState({
    name: 'ExamFlow Pro',
    description: 'Professional Online Exam Management System',
    logoUrl: '',
    footerText: '',
  })
  const [step, setStep] = useState<FormStep>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Academic options loaded dynamically
  const [departments, setDepartments] = useState<OptionItem[]>([])
  const [subjects, setSubjects] = useState<OptionItem[]>([])
  const [languages, setLanguages] = useState<OptionItem[]>([])
  const [groups, setGroups] = useState<OptionItem[]>([])
  const [years, setYears] = useState<OptionItem[]>([])
  const [semesters, setSemesters] = useState<OptionItem[]>([])
  const [customFields, setCustomFields] = useState<RegistrationCustomField[]>([])
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string | boolean>>({})
  const [optionsLoaded, setOptionsLoaded] = useState(false)

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    course: '',
    departmentId: '',
    subjectId: '',
    languageId: '',
    groupId: '',
    academicYearId: '',
    semesterId: '',
  })

  const loadAcademicOptions = async () => {
    if (optionsLoaded) return
    try {
      const [depts, langs, yrs, sems] = await Promise.all([
        fetch('/api/public/departments').then((r) => r.json()),
        fetch('/api/public/languages').then((r) => r.json()),
        fetch('/api/public/years').then((r) => r.json()),
        fetch('/api/public/semesters').then((r) => r.json()),
      ])
      setDepartments(depts)
      setLanguages(langs)
      setGroups([])
      setYears(yrs)
      setSemesters(sems)
      setOptionsLoaded(true)
    } catch {
      setError('Failed to load registration options. Please refresh.')
    }
  }

  const loadSubjectsForDepartment = async (departmentId: string) => {
    if (!departmentId) {
      setSubjects([])
      return
    }
    const data = await fetch(`/api/public/subjects?departmentId=${departmentId}`).then((r) => r.json())
    setSubjects(data)
  }

  const loadGroupsForAcademicYear = async (academicYearId: string) => {
    if (!academicYearId) {
      setGroups([])
      return
    }
    const data = await fetch(`/api/public/groups?academicYearId=${academicYearId}`).then((r) => r.json())
    setGroups(data)
  }

  useEffect(() => {
    fetch('/api/public/system-settings')
      .then((res) => res.json())
      .then((data) => {
        setBranding({
          name: data.name || 'ExamFlow Pro',
          description: data.description || 'Professional Online Exam Management System',
          logoUrl: data.logoUrl || '',
          footerText: data.footerText || '',
        })
      })
      .catch(() => {})
  }, [])

  const loadCustomFieldsForDepartment = async (departmentId: string) => {
    if (!departmentId) {
      setCustomFields([])
      setCustomFieldValues({})
      return
    }

    const data: RegistrationCustomField[] = await fetch(`/api/public/registration-fields?departmentId=${departmentId}`).then((r) => r.json())
    setCustomFields(data)
    setCustomFieldValues(
      Object.fromEntries(
        data.map((field) => [field.key, field.type === 'CHECKBOX' ? false : ''])
      )
    )
  }

  const updateAcademicField = (key: keyof typeof form, value: string) => {
    setForm((current) => {
      if (key === 'departmentId') {
        setGroups([])
        return {
          ...current,
          departmentId: value,
          subjectId: '',
          academicYearId: '',
          groupId: '',
          languageId: '',
          semesterId: '',
        }
      }

      if (key === 'academicYearId') {
        setGroups([])
        return {
          ...current,
          academicYearId: value,
          groupId: '',
          languageId: '',
          semesterId: '',
        }
      }

      if (key === 'groupId') {
        return {
          ...current,
          groupId: value,
          languageId: '',
          semesterId: '',
        }
      }

      if (key === 'languageId') {
        return {
          ...current,
          languageId: value,
          semesterId: '',
        }
      }

      return {
        ...current,
        [key]: value,
      }
    })
  }

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setError(null)
    await loadAcademicOptions()
    setStep(2)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          phone: form.phone || undefined,
          course: form.course,
          departmentId: form.departmentId,
          subjectId: form.subjectId,
          languageId: form.languageId,
          groupId: form.groupId,
          academicYearId: form.academicYearId,
          semesterId: form.semesterId,
          customFieldResponses: customFieldValues,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Registration failed')

      if (data.requiresVerification && data.debugCode) {
        window.sessionStorage.setItem(`verify-code:${form.email}`, data.debugCode)
      }

      if (data.requiresVerification) {
        router.push(`/verify-account?email=${encodeURIComponent(form.email)}&registered=1`)
        return
      }

      router.push(`/login?registered=1&message=${encodeURIComponent(data.message || 'Registration successful.')}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.name} className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-white/20 object-cover p-1 backdrop-blur" />
          ) : (
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 backdrop-blur mb-3">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">{t('auth.register.title', 'Student Registration')}</h1>
          <p className="text-blue-200 mt-1">{branding.name}</p>
          <p className="text-blue-100 mt-1 text-sm">{branding.description}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-6">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {s}
                </div>
                <span className={`text-sm ${step === s ? 'font-medium text-gray-900' : 'text-gray-400'}`}>
                  {s === 1
                    ? t('auth.register.account_info', 'Account Info')
                    : t('auth.register.academic_details', 'Academic Details')}
                </span>
                {s < 2 && <div className="w-8 h-px bg-gray-200" />}
              </div>
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
          )}

          {/* Step 1: Account Info */}
          {step === 1 && (
            <form onSubmit={handleStep1} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.register.full_name', 'Full Name *')}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                  placeholder="Your full name"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.register.email', 'Email *')}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                  placeholder="your@email.com"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <PasswordField
                    label={t('auth.register.password', 'Password *')}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                    placeholder="Min 8 chars"
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <PasswordField
                    label={t('auth.register.confirm', 'Confirm *')}
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                    placeholder="Repeat password"
                    required
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.register.phone', 'Phone')}</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.register.course', 'Course *')}</label>
                <select
                  value={form.course}
                  onChange={(e) => setForm({ ...form, course: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                  required
                >
                  <option value="">{t('common.select', 'Select...')}</option>
                  <option value="BACHELOR_OF_SCIENCE">{t('auth.register.course_bsc', 'Bachelor of Science')}</option>
                  <option value="MASTER_OF_SCIENCE">{t('auth.register.course_msc', 'Master of Science')}</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {t('auth.register.course_help', 'Choose the course that matches your program.')}
                </p>
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
              >
                {t('auth.register.next_academic', 'Next: Academic Details')}
              </button>
            </form>
          )}

          {/* Step 2: Academic Details */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.register.department', 'Department *')}</label>
                <select
                  value={form.departmentId}
                  onChange={(e) => {
                    updateAcademicField('departmentId', e.target.value)
                    loadSubjectsForDepartment(e.target.value)
                    loadCustomFieldsForDepartment(e.target.value)
                  }}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                  required
                >
                  <option value="">{t('common.select', 'Select...')}</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.register.academic_year', 'Academic Year *')}</label>
                  <select
                    value={form.academicYearId}
                    onChange={(e) => {
                      updateAcademicField('academicYearId', e.target.value)
                      loadGroupsForAcademicYear(e.target.value)
                    }}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                    required
                    disabled={!form.departmentId}
                  >
                    <option value="">{t('common.select', 'Select...')}</option>
                    {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.register.group', 'Group *')}</label>
                  <select
                    value={form.groupId}
                    onChange={(e) => updateAcademicField('groupId', e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                    required
                    disabled={!form.academicYearId}
                  >
                    <option value="">{t('common.select', 'Select...')}</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.register.language', 'Department Language *')}</label>
                  <select
                    value={form.languageId}
                    onChange={(e) => updateAcademicField('languageId', e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                    required
                    disabled={!form.groupId}
                  >
                    <option value="">{t('common.select', 'Select...')}</option>
                    {languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.register.semester', 'Semester *')}</label>
                  <select
                    value={form.semesterId}
                    onChange={(e) => updateAcademicField('semesterId', e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                    required
                    disabled={!form.languageId}
                  >
                    <option value="">{t('common.select', 'Select...')}</option>
                    {semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.register.subject', 'Subject *')}</label>
                <select
                  value={form.subjectId}
                  onChange={(e) => updateAcademicField('subjectId', e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                  required
                  disabled={!form.departmentId || !form.semesterId}
                >
                  <option value="">{t('common.select', 'Select...')}</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                {t(
                  'auth.register.scope_help',
                  'Your dashboard and exam access will use your selected course, department, academic year, group, department language, semester, and subject. Your site language is separate and can be changed from the language switcher.'
                )}
              </div>

              {customFields.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-gray-900">{t('auth.register.additional_info', 'Additional Information')}</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {t('auth.register.additional_info_help', 'These extra details were added dynamically by your department admin.')}
                    </p>
                  </div>
                  <div className="space-y-4">
                    {customFields.map((field) => (
                      <div key={field.id}>
                        {field.type === 'CHECKBOX' ? (
                          <label className="inline-flex items-start gap-3 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={customFieldValues[field.key] === true}
                              onChange={(event) =>
                                setCustomFieldValues((current) => ({
                                  ...current,
                                  [field.key]: event.target.checked,
                                }))
                              }
                              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span>
                              <span className="font-medium text-gray-900">{field.label}{field.isRequired ? ' *' : ''}</span>
                              {field.placeholder && <span className="mt-1 block text-xs text-gray-500">{field.placeholder}</span>}
                            </span>
                          </label>
                        ) : field.type === 'SELECT' ? (
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                              {field.label} {field.isRequired && '*'}
                            </label>
                            <select
                              value={String(customFieldValues[field.key] ?? '')}
                              onChange={(event) =>
                                setCustomFieldValues((current) => ({
                                  ...current,
                                  [field.key]: event.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-500"
                              required={field.isRequired}
                            >
                              <option value="">{t('common.select', 'Select...')}</option>
                              {(field.options ?? []).map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">
                              {field.label} {field.isRequired && '*'}
                            </label>
                            <input
                              type="text"
                              value={String(customFieldValues[field.key] ?? '')}
                              onChange={(event) =>
                                setCustomFieldValues((current) => ({
                                  ...current,
                                  [field.key]: event.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-500"
                              placeholder={field.placeholder ?? 'Enter your answer'}
                              required={field.isRequired}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">
                    Order: Department {'->'} Year {'->'} Group {'->'} Department Language {'->'} Semester {'->'} Subject
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition"
                >
                  {t('common.back', 'Back')}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('auth.register.registering', 'Registering...')}
                    </>
                  ) : t('auth.register.create_account', 'Create Account')}
                </button>
              </div>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-gray-600">
            {t('auth.register.already_have_account', 'Already have an account?')}{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">{t('auth.register.sign_in', 'Sign in')}</Link>
          </p>
          {branding.footerText && (
            <p className="mt-4 text-center text-xs text-gray-500">{branding.footerText}</p>
          )}
        </div>
      </div>
    </div>
  )
}
