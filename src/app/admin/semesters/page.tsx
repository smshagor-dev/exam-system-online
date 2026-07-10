import { requireRole } from '@/lib/auth'
import { getCurrentLocale, getMessages, tFromMessages } from '@/lib/i18n/server'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function SemestersPage() {
  await requireRole(UserRole.SUPER_ADMIN)
  const locale = await getCurrentLocale()
  const messages = await getMessages(locale)
  const t = tFromMessages(messages)
  const semesters = await prisma.semester.findMany({ orderBy: { number: 'asc' } })

  return (
    <SimpleEntityManager
      title={t('shell.semesters', 'Semesters')}
      singularLabel={t('shell.semesters', 'Semester')}
      items={semesters}
      columns={[
        { key: 'name', label: t('common.name', 'Name') },
        { key: 'number', label: 'Semester Number' },
      ]}
      fields={[
        { key: 'name', label: `${t('common.name', 'Name')} (e.g. "Semester 1")`, type: 'text', required: true },
        { key: 'number', label: 'Semester Number', type: 'number', required: true },
      ]}
      apiBase="/api/admin/semesters"
    />
  )
}
