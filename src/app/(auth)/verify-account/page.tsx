'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher'
import { useI18n } from '@/components/i18n/LanguageProvider'

export default function VerifyAccountPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [branding, setBranding] = useState({
    name: 'ExamFlow Pro',
    description: 'Professional Online Exam Management System',
    logoUrl: '',
  })
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
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

    const params = new URLSearchParams(window.location.search)
    const currentEmail = params.get('email') ?? ''

    setEmail(currentEmail)
    if (params.get('registered') === '1') {
      setMessage(t('auth.verify.registered_message', 'Your account was created. Enter the 6-digit code to verify it.'))
    }

    if (!currentEmail) return

    const storedCode = window.sessionStorage.getItem(`verify-code:${currentEmail}`)
    if (storedCode) {
      setDebugCode(storedCode)
    }
  }, [t])

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/verify-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to verify account')
      }

      window.sessionStorage.removeItem(`verify-code:${email}`)
      router.push('/login?verified=1')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.verify.verify', 'Verify Account'))
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (!email) {
      setError(t('auth.login.email', 'Email Address'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/send-verification-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || t('auth.verify.resend', 'Resend code'))
      }

      setMessage(data.message)
      setDebugCode(data.debugCode ?? null)
      if (data.debugCode) {
        window.sessionStorage.setItem(`verify-code:${email}`, data.debugCode)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.verify.resend', 'Resend code'))
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
        <h1 className="text-2xl font-bold text-gray-900">{t('auth.verify.title', 'Verify Account')}</h1>
        <p className="mt-2 text-sm text-gray-600">
          {t('auth.verify.help', 'Enter the 6-digit code sent to your email to activate your account.')}
        </p>

        {message && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {debugCode && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {t('common.development_code', 'Development code')}: <span className="font-mono font-semibold tracking-[0.3em]">{debugCode}</span>
          </div>
        )}

        <form onSubmit={handleVerify} className="mt-6 space-y-4">
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

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? t('auth.verify.verifying', 'Verifying...') : t('auth.verify.verify', 'Verify Account')}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={handleResend}
            disabled={loading}
            className="font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60"
          >
            {t('auth.verify.resend', 'Resend code')}
          </button>
          <Link href="/login" className="font-medium text-gray-600 hover:text-gray-800">
            {t('auth.verify.back_to_sign_in', 'Back to Sign In')}
          </Link>
        </div>
      </div>
    </div>
  )
}
