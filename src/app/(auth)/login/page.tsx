'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema } from '@/lib/validators'
import { z } from 'zod'
import Link from 'next/link'
import { PasswordField } from '@/components/auth/PasswordField'
import { useI18n } from '@/components/i18n/LanguageProvider'

type LoginForm = z.infer<typeof loginSchema>
const REMEMBERED_EMAIL_KEY = 'examflow.rememberedEmail'

export default function LoginPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [branding, setBranding] = useState({
    name: 'ExamFlow Pro',
    description: 'Professional Online Exam Management System',
    logoUrl: '',
    footerText: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

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

    const rememberedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY)
    if (rememberedEmail) {
      setValue('email', rememberedEmail)
      setRememberMe(true)
    }

    const params = new URLSearchParams(window.location.search)
    if (params.get('verified') === '1') {
      setSuccessMessage(t('auth.login.success_verified', 'Account verified successfully. You can sign in now.'))
      return
    }

    if (params.get('registered') === '1') {
      setSuccessMessage(params.get('message') || 'Registration successful. You can sign in now.')
      return
    }

    if (params.get('reset') === '1') {
      setSuccessMessage(t('auth.login.success_reset', 'Password reset successful. Sign in with your new password.'))
      return
    }

    if (params.get('blocked') === '1') {
      setError(t('auth.login.blocked', 'Your student access has ended. Please contact your department.'))
    }
  }, [setValue, t])

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    setError(null)

    try {
      if (rememberMe) {
        window.localStorage.setItem(REMEMBERED_EMAIL_KEY, data.email)
      } else {
        window.localStorage.removeItem(REMEMBERED_EMAIL_KEY)
      }

      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      })

      if (result?.error) {
        setError(t('auth.login.invalid_credentials', 'Invalid email or password, your account is not verified yet, or student access has ended. Please contact your department.'))
        return
      }

      router.push('/')
      router.refresh()
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.name} className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-white/20 object-cover p-1 backdrop-blur" />
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/20 backdrop-blur mb-4">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          )}
          <h1 className="text-3xl font-bold text-white">{branding.name}</h1>
          <p className="text-blue-200 mt-1">{branding.description}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{t('auth.login.title', 'Sign In')}</h2>

          {successMessage && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm">
              {successMessage}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('auth.login.email', 'Email Address')}
              </label>
              <input
                {...register('email')}
                type="email"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition text-gray-900"
                placeholder="you@examflow.pro"
                autoComplete="email"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

              <PasswordField
                {...register('password')}
              label={t('auth.login.password', 'Password')}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition text-gray-900"
              placeholder={t('auth.login.password', 'Password')}
              autoComplete="current-password"
              error={errors.password?.message}
            />

            <div className="flex items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {t('auth.login.remember_me', 'Remember me')}
              </label>
              <Link href="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                {t('auth.login.forgot_password', 'Forgot password?')}
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t('auth.login.signing_in', 'Signing in...')}
                </>
              ) : (
                t('auth.login.sign_in', 'Sign In')
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            {t('auth.login.no_account', "Don't have an account?")}{' '}
            <Link href="/register" className="text-blue-600 hover:text-blue-700 font-medium">
              {t('auth.login.register_here', 'Register here')}
            </Link>
          </p>

          <div className="mt-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('auth.login.demo_credentials', 'Demo Credentials')}</p>
            <div className="space-y-1 text-xs text-gray-600">
              <p><span className="font-medium">Admin:</span> admin@examflow.pro / Admin@123</p>
              <p><span className="font-medium">Department Admin:</span> cse.admin@examflow.pro / Admin@123</p>
              <p><span className="font-medium">Teacher:</span> teacher.john@examflow.pro / Teacher@123</p>
              <p><span className="font-medium">Student:</span> alice@student.examflow.pro / Student@123</p>
            </div>
          </div>

          {branding.footerText && (
            <p className="mt-4 text-center text-xs text-gray-500">{branding.footerText}</p>
          )}
        </div>
      </div>
    </div>
  )
}
