'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n/LanguageProvider'

type Settings = {
  systemName: string
  smtpHost: string | null
  smtpPort: number | null
  smtpSecure: boolean
  smtpUser: string | null
  smtpPass: string | null
  mailFrom: string | null
  requireEmailVerification: boolean
}

type Props = {
  settings: Settings
  hasStoredPassword: boolean
}

export default function SmtpSetupManager({ settings, hasStoredPassword }: Props) {
  const router = useRouter()
  const { t } = useI18n()
  const [form, setForm] = useState({
    smtpHost: settings.smtpHost ?? '',
    smtpPort: settings.smtpPort ? String(settings.smtpPort) : '',
    smtpSecure: settings.smtpSecure,
    smtpUser: settings.smtpUser ?? '',
    smtpPass: '',
    mailFrom: settings.mailFrom ?? '',
    requireEmailVerification: settings.requireEmailVerification,
  })
  const [testEmail, setTestEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch('/api/admin/system-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          smtpPort: form.smtpPort ? Number(form.smtpPort) : null,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        const firstError = typeof data.error === 'object' ? Object.values(data.error)[0] : null
        throw new Error(Array.isArray(firstError) ? firstError[0] : data.error || 'Failed to save settings')
      }

      setMessage('SMTP settings updated successfully.')
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleTestEmail = async () => {
    setTesting(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch('/api/admin/system-settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail }),
      })

      const data = await response.json()
      if (!response.ok) {
        const firstError = typeof data.error === 'object' ? Object.values(data.error)[0] : null
        throw new Error(Array.isArray(firstError) ? firstError[0] : data.error || 'Failed to send test email')
      }

      setMessage(data.message)
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Failed to send test email')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold text-slate-900">SMTP Setup</h1>
          <p className="mt-2 text-sm text-slate-500">
            Manage outgoing email and control whether new users must verify their email before sign in.
          </p>
        </div>

        {message && (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="mt-6 space-y-6">
          <div className="rounded-2xl border border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-900">Registration Policy</h2>
            <p className="mt-1 text-sm text-slate-500">
              When enabled, students must verify their email with a 6-digit code before they can sign in.
            </p>

            <label className="mt-4 inline-flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.requireEmailVerification}
                onChange={(event) =>
                  setForm((current) => ({ ...current, requireEmailVerification: event.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="font-medium text-slate-900">Require email verification for new user registration</span>
                <span className="mt-1 block text-xs text-slate-500">
                  Turning this off also allows existing unverified users to sign in immediately.
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-900">SMTP Credentials</h2>
            <p className="mt-1 text-sm text-slate-500">
              Leave these blank to keep using environment fallback values. Once saved here, database settings take priority.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">SMTP Host</label>
                <input
                  type="text"
                  value={form.smtpHost}
                  onChange={(event) => setForm((current) => ({ ...current, smtpHost: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="smtp.example.com"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">SMTP Port</label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={form.smtpPort}
                  onChange={(event) => setForm((current) => ({ ...current, smtpPort: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="587"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">SMTP Username</label>
                <input
                  type="text"
                  value={form.smtpUser}
                  onChange={(event) => setForm((current) => ({ ...current, smtpUser: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="smtp-user"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">SMTP Password</label>
                <input
                  type="password"
                  value={form.smtpPass}
                  onChange={(event) => setForm((current) => ({ ...current, smtpPass: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder={hasStoredPassword ? 'Leave blank to keep current password' : 'smtp-password'}
                />
                {hasStoredPassword && (
                  <p className="mt-1 text-xs text-slate-500">A password is already stored. Enter a new one only if you want to replace it.</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">From Email</label>
                <input
                  type="text"
                  value={form.mailFrom}
                  onChange={(event) => setForm((current) => ({ ...current, mailFrom: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder={`${settings.systemName || 'ExamFlow Pro'} <no-reply@example.com>`}
                />
              </div>
            </div>

            <label className="mt-4 inline-flex items-center gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.smtpSecure}
                onChange={(event) => setForm((current) => ({ ...current, smtpSecure: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Use secure SMTP connection</span>
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? t('common.saving', 'Saving...') : 'Save SMTP Settings'}
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Test Mail</h2>
        <p className="mt-1 text-sm text-slate-500">
          Save your SMTP settings first, then send a quick test to confirm delivery.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            value={testEmail}
            onChange={(event) => setTestEmail(event.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            placeholder="recipient@example.com"
          />
          <button
            type="button"
            onClick={handleTestEmail}
            disabled={testing}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {testing ? 'Sending...' : 'Send Test Email'}
          </button>
        </div>
      </div>
    </div>
  )
}
