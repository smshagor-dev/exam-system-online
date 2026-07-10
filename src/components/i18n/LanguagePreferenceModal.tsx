'use client'

import { useEffect, useState } from 'react'
import { LOCALE_COOKIE_NAME } from '@/lib/i18n/messages'
import { LOCALE_STORAGE_KEY, useI18n } from './LanguageProvider'

export default function LanguagePreferenceModal() {
  const { locale, locales, t } = useI18n()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const savedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY)

    if (savedLocale && locales.some((item) => item.code === savedLocale)) {
      if (savedLocale !== locale) {
        document.cookie = `${LOCALE_COOKIE_NAME}=${savedLocale}; path=/; max-age=31536000; samesite=lax`
        window.location.reload()
      }
      return
    }

    setShow(true)
  }, [locale, locales])

  const handleChoose = (nextLocale: string) => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
    document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=31536000; samesite=lax`
    window.location.reload()
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <h2 className="text-2xl font-bold text-slate-900">
          {t('common.choose_language_title', 'Choose your language')}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          {t('common.choose_language_help', 'Select the language you want to use on this device. You can change it later from inside the app.')}
        </p>

        <div className="mt-6 space-y-3">
          {locales.map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={() => handleChoose(option.code)}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-blue-400 hover:bg-blue-50"
            >
              <span className="font-medium text-slate-900">{option.label}</span>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-400">{option.code}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
