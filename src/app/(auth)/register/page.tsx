'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type FormStep = 1 | 2

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState<FormStep>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Academic options loaded dynamically
  const [departments, setDepartments] = useState<any[]>([])
  const [subjects, setSubjects] = useState<any[]>([])
  const [languages, setLanguages] = useState<any[]>([])
  const [groups, setGroups] = useState<any[]>([])
  const [years, setYears] = useState<any[]>([])
  const [semesters, setSemesters] = useState<any[]>([])
  const [optionsLoaded, setOptionsLoaded] = useState(false)

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    rollNumber: '',
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
      const [depts, langs, grps, yrs, sems] = await Promise.all([
        fetch('/api/public/departments').then((r) => r.json()),
        fetch('/api/public/languages').then((r) => r.json()),
        fetch('/api/public/groups').then((r) => r.json()),
        fetch('/api/public/years').then((r) => r.json()),
        fetch('/api/public/semesters').then((r) => r.json()),
      ])
      setDepartments(depts)
      setLanguages(langs)
      setGroups(grps)
      setYears(yrs)
      setSemesters(sems)
      setOptionsLoaded(true)
    } catch {
      setError('Failed to load registration options. Please refresh.')
    }
  }

  const loadSubjectsForDepartment = async (departmentId: string) => {
    if (!departmentId) return
    const data = await fetch(`/api/public/subjects?departmentId=${departmentId}`).then((r) => r.json())
    setSubjects(data)
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
          rollNumber: form.rollNumber || undefined,
          departmentId: form.departmentId,
          subjectId: form.subjectId,
          languageId: form.languageId,
          groupId: form.groupId,
          academicYearId: form.academicYearId,
          semesterId: form.semesterId,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Registration failed')

      router.push('/login?registered=1')
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
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/20 backdrop-blur mb-3">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Student Registration</h1>
          <p className="text-blue-200 mt-1">ExamFlow Pro</p>
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
                  {s === 1 ? 'Account Info' : 'Academic Details'}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                    placeholder="Min 8 chars"
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm *</label>
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                    placeholder="Repeat password"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Roll Number</label>
                  <input
                    type="text"
                    value={form.rollNumber}
                    onChange={(e) => setForm({ ...form, rollNumber: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
              >
                Next: Academic Details →
              </button>
            </form>
          )}

          {/* Step 2: Academic Details */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                <select
                  value={form.departmentId}
                  onChange={(e) => {
                    setForm({ ...form, departmentId: e.target.value, subjectId: '' })
                    loadSubjectsForDepartment(e.target.value)
                  }}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                  required
                >
                  <option value="">Select your department...</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                <select
                  value={form.subjectId}
                  onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                  required
                  disabled={!form.departmentId}
                >
                  <option value="">Select subject...</option>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Language *</label>
                  <select
                    value={form.languageId}
                    onChange={(e) => setForm({ ...form, languageId: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                    required
                  >
                    <option value="">Select...</option>
                    {languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Group *</label>
                  <select
                    value={form.groupId}
                    onChange={(e) => setForm({ ...form, groupId: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                    required
                  >
                    <option value="">Select...</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year *</label>
                <select
                  value={form.academicYearId}
                  onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                  required
                >
                  <option value="">Select year...</option>
                  {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
                </select>
              </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Semester *</label>
                  <select
                    value={form.semesterId}
                    onChange={(e) => setForm({ ...form, semesterId: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 outline-none text-gray-900 text-sm"
                    required
                  >
                    <option value="">Select semester...</option>
                    {semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition"
                >
                  ← Back
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
                      Registering...
                    </>
                  ) : 'Create Account'}
                </button>
              </div>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
