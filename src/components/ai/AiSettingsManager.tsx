'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Provider = 'OPENAI' | 'GEMINI' | 'CLAUDE'

type Props = {
  settings: {
    aiEnabled: boolean
    aiProvider: Provider | null
    aiOpenAiModel: string | null
    aiGeminiModel: string | null
    aiClaudeModel: string | null
    aiTemperature: number | null
    hasOpenAiApiKey: boolean
    hasGeminiApiKey: boolean
    hasClaudeApiKey: boolean
  }
  audience: 'admin' | 'teacher'
}

const PROVIDERS: { value: Provider; label: string; helper: string }[] = [
  { value: 'OPENAI', label: 'OpenAI', helper: 'Use GPT models such as gpt-4o-mini or gpt-4.1.' },
  { value: 'GEMINI', label: 'Gemini', helper: 'Use Gemini models such as gemini-2.5-flash.' },
  { value: 'CLAUDE', label: 'Claude', helper: 'Use Claude models such as claude-sonnet-4-20250514.' },
]

export default function AiSettingsManager({ settings, audience }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({
    aiEnabled: settings.aiEnabled,
    aiProvider: settings.aiProvider ?? 'OPENAI',
    aiOpenAiApiKey: '',
    aiOpenAiModel: settings.aiOpenAiModel ?? 'gpt-4o-mini',
    aiGeminiApiKey: '',
    aiGeminiModel: settings.aiGeminiModel ?? 'gemini-2.5-flash',
    aiClaudeApiKey: '',
    aiClaudeModel: settings.aiClaudeModel ?? 'claude-sonnet-4-20250514',
    aiTemperature: String(settings.aiTemperature ?? 0.2),
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const isTeacherView = audience === 'teacher'

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch('/api/ai-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          aiTemperature: Number(form.aiTemperature),
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        const firstError = typeof data.error === 'object' ? Object.values(data.error)[0] : null
        throw new Error(Array.isArray(firstError) ? firstError[0] : data.error || 'Failed to save AI settings')
      }

      setMessage('AI settings updated successfully.')
      router.refresh()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save AI settings')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setError(null)
    setMessage(null)

    try {
      const response = await fetch('/api/ai-settings/test', {
        method: 'POST',
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'AI test failed')
      }

      setMessage(`${data.message} Suggested marks: ${data.result.suggestedMarks}/${5}, confidence ${data.result.confidence}.`)
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'AI test failed')
    } finally {
      setTesting(false)
    }
  }

  const currentProvider = form.aiProvider as Provider

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold text-slate-900">AI Settings</h1>
          <p className="mt-2 text-sm text-slate-500">
            Configure database-based AI evaluation with OpenAI, Gemini, or Claude. {isTeacherView ? 'Teachers can manage and test the active evaluator here.' : 'Admins can manage the active evaluator for AI-assisted review.'}
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
            <h2 className="text-lg font-semibold text-slate-900">AI Evaluation</h2>
            <p className="mt-1 text-sm text-slate-500">
              This affects `AI Assisted` exam result mode. AI only suggests marks and feedback. Teachers still confirm final marks.
            </p>

            <label className="mt-4 inline-flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.aiEnabled}
                onChange={(event) => setForm((current) => ({ ...current, aiEnabled: event.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="font-medium text-slate-900">Enable AI-assisted evaluation</span>
                <span className="mt-1 block text-xs text-slate-500">
                  When enabled, pending short and written answers in AI-assisted exams are sent to the selected provider for suggestions.
                </span>
              </span>
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-900">Provider</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {PROVIDERS.map((provider) => (
                <label
                  key={provider.value}
                  className={`rounded-xl border-2 p-4 transition ${currentProvider === provider.value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <input
                    type="radio"
                    name="aiProvider"
                    value={provider.value}
                    checked={currentProvider === provider.value}
                    onChange={(event) => setForm((current) => ({ ...current, aiProvider: event.target.value as Provider }))}
                    className="sr-only"
                  />
                  <p className="font-medium text-slate-900">{provider.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{provider.helper}</p>
                </label>
              ))}
            </div>

            <div className="mt-5">
              <label className="mb-1 block text-sm font-medium text-slate-700">Temperature</label>
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={form.aiTemperature}
                onChange={(event) => setForm((current) => ({ ...current, aiTemperature: event.target.value }))}
                className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-900">OpenAI</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">API Key</label>
                <input
                  type="password"
                  value={form.aiOpenAiApiKey}
                  onChange={(event) => setForm((current) => ({ ...current, aiOpenAiApiKey: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder={settings.hasOpenAiApiKey ? 'Leave blank to keep current OpenAI key' : 'sk-...'}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Model</label>
                <input
                  type="text"
                  value={form.aiOpenAiModel}
                  onChange={(event) => setForm((current) => ({ ...current, aiOpenAiModel: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="gpt-4o-mini"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-900">Gemini</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">API Key</label>
                <input
                  type="password"
                  value={form.aiGeminiApiKey}
                  onChange={(event) => setForm((current) => ({ ...current, aiGeminiApiKey: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder={settings.hasGeminiApiKey ? 'Leave blank to keep current Gemini key' : 'AIza...'}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Model</label>
                <input
                  type="text"
                  value={form.aiGeminiModel}
                  onChange={(event) => setForm((current) => ({ ...current, aiGeminiModel: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="gemini-2.5-flash"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-900">Claude</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">API Key</label>
                <input
                  type="password"
                  value={form.aiClaudeApiKey}
                  onChange={(event) => setForm((current) => ({ ...current, aiClaudeApiKey: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder={settings.hasClaudeApiKey ? 'Leave blank to keep current Claude key' : 'sk-ant-...'}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Model</label>
                <input
                  type="text"
                  value={form.aiClaudeModel}
                  onChange={(event) => setForm((current) => ({ ...current, aiClaudeModel: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="claude-sonnet-4-20250514"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save AI Settings'}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {testing ? 'Testing...' : 'Test AI Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
