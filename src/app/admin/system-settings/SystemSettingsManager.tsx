'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n/LanguageProvider'

type Settings = {
  systemName: string
  systemShortName: string
  systemDescription: string | null
  systemLogoUrl: string | null
  systemIconUrl: string | null
  footerText: string | null
  supportEmail: string | null
}

type Props = {
  settings: Settings
}

export default function SystemSettingsManager({ settings }: Props) {
  const router = useRouter()
  const { t } = useI18n()
  const [form, setForm] = useState({
    systemName: settings.systemName ?? 'ExamFlow Pro',
    systemShortName: settings.systemShortName ?? 'EMS',
    systemDescription: settings.systemDescription ?? '',
    systemLogoUrl: settings.systemLogoUrl ?? '',
    systemIconUrl: settings.systemIconUrl ?? '',
    footerText: settings.footerText ?? '',
    supportEmail: settings.supportEmail ?? '',
  })
  const [saving, setSaving] = useState(false)
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
        body: JSON.stringify(form),
      })

      const data = await response.json()
      if (!response.ok) {
        const firstError = typeof data.error === 'object' ? Object.values(data.error)[0] : null
        throw new Error(Array.isArray(firstError) ? firstError[0] : data.error || 'Failed to save settings')
      }

      setMessage('System settings updated successfully.')
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold text-slate-900">System Settings</h1>
          <p className="mt-2 text-sm text-slate-500">
            Manage branding, site identity, footer text, and support contact information.
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
            <h2 className="text-lg font-semibold text-slate-900">Branding</h2>
            <p className="mt-1 text-sm text-slate-500">
              These values appear across login screens, sidebars, browser metadata, and shared app branding.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">System Name</label>
                <input
                  type="text"
                  value={form.systemName}
                  onChange={(event) => setForm((current) => ({ ...current, systemName: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="ExamFlow Pro"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Short Name</label>
                <input
                  type="text"
                  value={form.systemShortName}
                  onChange={(event) => setForm((current) => ({ ...current, systemShortName: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="EMS"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">System Description</label>
                <textarea
                  rows={3}
                  value={form.systemDescription}
                  onChange={(event) => setForm((current) => ({ ...current, systemDescription: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="Professional Online Exam Management System"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Logo URL</label>
                <input
                  type="url"
                  value={form.systemLogoUrl}
                  onChange={(event) => setForm((current) => ({ ...current, systemLogoUrl: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="https://example.com/logo.png"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Icon URL / Favicon</label>
                <input
                  type="url"
                  value={form.systemIconUrl}
                  onChange={(event) => setForm((current) => ({ ...current, systemIconUrl: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="https://example.com/favicon.png"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Support Email</label>
                <input
                  type="email"
                  value={form.supportEmail}
                  onChange={(event) => setForm((current) => ({ ...current, supportEmail: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="support@example.com"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Footer Text</label>
                <input
                  type="text"
                  value={form.footerText}
                  onChange={(event) => setForm((current) => ({ ...current, footerText: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="Powered by Your Organization"
                />
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preview</p>
              <div className="flex items-center gap-3">
                {form.systemLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.systemLogoUrl} alt={form.systemName} className="h-12 w-12 rounded-2xl object-cover ring-1 ring-slate-200" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-sm font-semibold text-white">
                    {(form.systemShortName || form.systemName).slice(0, 3).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-base font-semibold text-slate-900">{form.systemName || 'ExamFlow Pro'}</p>
                  <p className="text-sm text-slate-500">{form.systemDescription || 'Professional Online Exam Management System'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? t('common.saving', 'Saving...') : 'Save System Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
