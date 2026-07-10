'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PasswordField } from '@/components/auth/PasswordField'
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher'
import { useI18n } from '@/components/i18n/LanguageProvider'

export default function ForgotPasswordPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [branding, setBranding] = useState({
    name: 'ExamFlow Pro',
    description: 'Professional Online Exam Management System',
    logoUrl: '',
  })
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [debugCode, setDebugCode] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/public/system-settings')
      .then((res) => res.json())
      .then((data) => {
        setBranding({
          name: data.name || 'ExamFlow Pro',
          description: data.description || 'Professional Online Exam Management System',
          logoUrl: data.logoUrl || '',
        })
      })
      .catch(() => {})
  }, [])

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || t('auth.forgot.send_code', 'Send 6-Digit Code'))
      }

      setSent(true)
      setMessage(data.message)
      setDebugCode(data.debugCode ?? null)
      if (data.debugCode) {
        window.sessionStorage.setItem(`reset-code:${email}`, data.debugCode)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.forgot.send_code', 'Send 6-Digit Code'))
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code,
          password,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || t('auth.forgot.reset_password', 'Reset Password'))
      }

      window.sessionStorage.removeItem(`reset-code:${email}`)
      router.push('/login?reset=1')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.forgot.reset_password', 'Reset Password'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>
        <div className="mb-5 text-center">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.name} className="mx-auto mb-3 h-14 w-14 rounded-2xl object-cover" />
          ) : null}
          <p className="text-sm font-semibold text-blue-600">{branding.name}</p>
          <p className="mt-1 text-xs text-gray-500">{branding.description}</p>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{t('auth.forgot.title', 'Forgot Password')}</h1>
        <p className="mt-2 text-sm text-gray-600">
          {t('auth.forgot.help', 'Enter your email to receive a 6-digit reset code, then choose a new password.')}
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {message}
          </div>
        )}

        {debugCode && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t('common.development_code', 'Development code')}: <span className="font-mono font-semibold tracking-[0.3em]">{debugCode}</span>
          </div>
        )}

        {!sent ? (
          <form onSubmit={handleSendCode} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('common.email_address', 'Email Address')}</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none transition focus:border-blue-500"
                placeholder="you@example.com"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? t('auth.forgot.sending_code', 'Sending code...') : t('auth.forgot.send_code', 'Send 6-Digit Code')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('common.email_address', 'Email Address')}</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none transition focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('auth.verify.code', '6-Digit Code')}</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 font-mono tracking-[0.4em] text-gray-900 outline-none transition focus:border-blue-500"
                placeholder="123456"
                required
              />
            </div>
            <PasswordField
              label={t('auth.forgot.new_password', 'New Password')}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none transition focus:border-blue-500"
              placeholder="Minimum 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <PasswordField
              label={t('auth.forgot.confirm_password', 'Confirm New Password')}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 outline-none transition focus:border-blue-500"
              placeholder="Repeat your new password"
              required
              minLength={8}
              autoComplete="new-password"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? t('auth.forgot.resetting_password', 'Resetting password...') : t('auth.forgot.reset_password', 'Reset Password')}
            </button>
          </form>
        )}

        <div className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setSent(false)
              setCode('')
              setPassword('')
              setConfirmPassword('')
              setDebugCode(null)
              setMessage(null)
              setError(null)
            }}
            className="font-medium text-gray-500 hover:text-gray-700"
          >
            {t('auth.forgot.start_over', 'Start over')}
          </button>
          <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
            {t('auth.verify.back_to_sign_in', 'Back to Sign In')}
          </Link>
        </div>
      </div>
    </div>
  )
}
