import { requireRole } from '@/lib/auth'
import { getCurrentLocale, getMessages, tFromMessages } from '@/lib/i18n/server'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function LanguagesPage() {
  await requireRole(UserRole.SUPER_ADMIN)
  const locale = await getCurrentLocale()
  const messages = await getMessages(locale)
  const t = tFromMessages(messages)

  const languageRecords = await prisma.language.findMany({ orderBy: { name: 'asc' } })
  const languages = languageRecords.map((language) => ({
    ...language,
    activeStatus: language.isActive ? t('common.yes', 'Yes') : t('common.no', 'No'),
  }))

  const columns = [
    { key: 'name', label: t('common.name', 'Name') },
    { key: 'code', label: t('common.code', 'Code') },
    { key: 'activeStatus', label: t('common.active', 'Active') },
  ]

  const fields = [
    { key: 'name', label: t('common.department_language', 'Department Language'), type: 'text' as const, required: true },
    { key: 'code', label: `${t('common.code', 'Code')} (e.g. EN)`, type: 'text' as const, required: true },
  ]

  return (
    <SimpleEntityManager
      title={t('common.department_languages', 'Department Languages')}
      singularLabel={t('common.department_language', 'Department Language')}
      items={languages}
      columns={columns}
      fields={fields}
      apiBase="/api/admin/languages"
    />
  )
}
