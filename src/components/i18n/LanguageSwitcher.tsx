'use client'

import { useI18n } from './LanguageProvider'

export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, locales, setLocale, t } = useI18n()

  return (
    <label className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'} text-slate-600`}>
      <span>{t('common.site_language', 'Site Language')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-700 outline-none focus:border-blue-500"
      >
        {locales.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
