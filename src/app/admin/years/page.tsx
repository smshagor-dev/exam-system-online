import { requireRole } from '@/lib/auth'
import { getCurrentLocale, getMessages, tFromMessages } from '@/lib/i18n/server'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function AcademicYearsPage() {
  const session = await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)
  const locale = await getCurrentLocale()
  const messages = await getMessages(locale)
  const t = tFromMessages(messages)
  const years = await prisma.academicYear.findMany({ orderBy: { year: 'asc' } })
  const canManageAll = session.user.role === UserRole.SUPER_ADMIN

  return (
    <SimpleEntityManager
      title={t('shell.academic_years', 'Academic Years')}
      singularLabel={t('shell.academic_years', 'Academic Year')}
      items={years}
      columns={[
        { key: 'name', label: t('common.name', 'Name') },
        { key: 'year', label: 'Year Number' },
      ]}
      fields={[
        { key: 'name', label: `${t('common.name', 'Name')} (e.g. "Year 1")`, type: 'text', required: true },
        { key: 'year', label: 'Year Number', type: 'number', required: true },
      ]}
      apiBase="/api/admin/years"
      canEdit={canManageAll}
      canDelete={canManageAll}
      formMode="modal"
    />
  )
}
