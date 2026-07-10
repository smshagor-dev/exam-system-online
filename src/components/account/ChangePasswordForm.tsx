'use client'

import { FormEvent, useState } from 'react'

type ChangePasswordFormProps = {
  title: string
  description: string
}

export default function ChangePasswordForm({ title, description }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to change password')
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess('Password changed successfully')
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Failed to change password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-5">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-700">{title}</p>
        <h1 className="text-2xl font-semibold text-slate-900">{description}</h1>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 max-w-2xl space-y-5">
        <label className="block text-sm font-medium text-slate-700">
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
            required
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
            required
            minLength={8}
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Confirm new password
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
            required
            minLength={8}
          />
        </label>

        <p className="text-sm text-slate-500">Use at least 8 characters for a stronger password.</p>

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
            {submitting ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </form>
    </section>
  )
}
