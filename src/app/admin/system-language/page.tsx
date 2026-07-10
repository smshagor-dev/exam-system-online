import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import SystemLanguageManager from './SystemLanguageManager'
import { getAvailableLocaleOptions } from '@/lib/i18n/locales'
import { getSourceMessages } from '@/lib/i18n/messages'

export default async function SystemLanguagePage() {
  await requireRole(UserRole.SUPER_ADMIN)

  const [entries, locales, systemLanguages] = await Promise.all([
    prisma.translationEntry.findMany({
      orderBy: [{ locale: 'asc' }, { key: 'asc' }],
    }),
    getAvailableLocaleOptions(),
    prisma.systemLanguage.findMany({ orderBy: { name: 'asc' } }),
  ])

  const sourceEntries = Object.entries(getSourceMessages()).map(([internalKey, key]) => ({
    internalKey,
    key,
  }))

  return (
    <SystemLanguageManager
      entries={entries}
      locales={locales}
      sourceEntries={sourceEntries}
      systemLanguages={systemLanguages}
    />
  )
}
