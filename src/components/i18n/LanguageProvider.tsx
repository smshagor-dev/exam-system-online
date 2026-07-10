'use client'

import { createContext, useContext, useMemo } from 'react'
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME } from '@/lib/i18n/messages'

export const LOCALE_STORAGE_KEY = 'examflow.siteLocale'

type LocaleOption = {
  code: string
  label: string
}

type LanguageContextValue = {
  locale: string
  locales: LocaleOption[]
  setLocale: (locale: string) => void
  t: (key: string, fallback?: string) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: DEFAULT_LOCALE,
  locales: [{ code: DEFAULT_LOCALE, label: 'English' }],
  setLocale: () => {},
  t: (key, fallback) => fallback ?? key,
})

export function LanguageProvider({
  children,
  locale,
  locales,
  messages,
}: {
  children: React.ReactNode
  locale: string
  locales: LocaleOption[]
  messages: Record<string, string>
}) {
  const value = useMemo<LanguageContextValue>(
    () => ({
      locale,
      locales,
      setLocale: (nextLocale) => {
        if (!locales.some((item) => item.code === nextLocale)) return
        window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
        document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=31536000; samesite=lax`
        window.location.reload()
      },
      t: (key, fallback) => messages[key] ?? (fallback ? messages[fallback] : undefined) ?? fallback ?? key,
    }),
    [locale, locales, messages]
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useI18n() {
  return useContext(LanguageContext)
}
