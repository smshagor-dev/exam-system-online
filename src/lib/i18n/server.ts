import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, getSourceMessages } from './messages'
import { getAvailableLocaleCodes, getDefaultLocaleCode, normalizeLocale } from './locales'

export async function getCurrentLocale(): Promise<string> {
  const store = await cookies()
  const locale = normalizeLocale(store.get(LOCALE_COOKIE_NAME)?.value)
  const localeCodes = await getAvailableLocaleCodes()
  const defaultLocale = await getDefaultLocaleCode()
  return localeCodes.includes(locale) ? locale : defaultLocale || DEFAULT_LOCALE
}

export async function getMessages(locale: string) {
  const entries = await prisma.translationEntry.findMany({
    where: { locale },
    select: { key: true, value: true },
  })

  const sourceMessages = getSourceMessages()
  const entryMap = new Map(entries.map((entry) => [entry.key, entry.value]))
  const messages: Record<string, string> = {}

  for (const [internalKey, englishText] of Object.entries(sourceMessages)) {
    const translatedValue = entryMap.get(englishText) ?? entryMap.get(internalKey) ?? englishText
    messages[internalKey] = translatedValue
    messages[englishText] = translatedValue
  }

  for (const entry of entries) {
    if (!(entry.key in messages)) {
      messages[entry.key] = entry.value
    }
  }

  return messages
}

export function tFromMessages(messages: Record<string, string>) {
  return (key: string, fallback?: string) => messages[key] ?? fallback ?? key
}
