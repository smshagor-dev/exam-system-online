import { prisma } from '@/lib/prisma'
import { DEFAULT_LOCALE } from './messages'

export type LocaleOption = {
  code: string
  label: string
}

export function normalizeLocale(locale: string | null | undefined) {
  return String(locale ?? '').trim().toLowerCase()
}

export async function getAvailableLocaleOptions(): Promise<LocaleOption[]> {
  const systemLanguages = await prisma.systemLanguage.findMany({
    where: { isActive: true },
    select: { code: true, name: true, isDefault: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })

  const localeMap = new Map<string, LocaleOption>()

  for (const language of systemLanguages) {
    const code = normalizeLocale(language.code)
    if (!code) continue

    localeMap.set(code, {
      code,
      label: language.name,
    })
  }

  if (!localeMap.has(DEFAULT_LOCALE)) {
    localeMap.set(DEFAULT_LOCALE, { code: DEFAULT_LOCALE, label: 'English' })
  }

  return Array.from(localeMap.values()).sort((a, b) => {
    const defaultCode = systemLanguages.find((language) => language.isDefault)?.code
    const normalizedDefaultCode = normalizeLocale(defaultCode)
    if (a.code === normalizedDefaultCode) return -1
    if (b.code === normalizedDefaultCode) return 1
    if (a.code === DEFAULT_LOCALE) return -1
    if (b.code === DEFAULT_LOCALE) return 1
    return a.label.localeCompare(b.label)
  })
}

export async function getAvailableLocaleCodes() {
  const options = await getAvailableLocaleOptions()
  return options.map((option) => option.code)
}

export async function isSupportedLocale(locale: string) {
  const normalizedLocale = normalizeLocale(locale)
  const localeCodes = await getAvailableLocaleCodes()
  return localeCodes.includes(normalizedLocale)
}

export async function getDefaultLocaleCode() {
  const defaultLanguage = await prisma.systemLanguage.findFirst({
    where: { isActive: true, isDefault: true },
    select: { code: true },
  })

  return normalizeLocale(defaultLanguage?.code) || DEFAULT_LOCALE
}
