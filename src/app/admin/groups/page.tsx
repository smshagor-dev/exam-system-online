import { requireRole } from '@/lib/auth'
import { getCurrentLocale, getMessages, tFromMessages } from '@/lib/i18n/server'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function GroupsPage() {
  const session = await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)
  const locale = await getCurrentLocale()
  const messages = await getMessages(locale)
  const t = tFromMessages(messages)
  const [groups, years] = await Promise.all([
    prisma.group.findMany({
      include: { academicYear: true },
      orderBy: [{ academicYear: { year: 'asc' } }, { name: 'asc' }],
    }),
    prisma.academicYear.findMany({ orderBy: { year: 'asc' } }),
  ])
  const canManageAll = session.user.role === UserRole.SUPER_ADMIN
  const items = groups.map((group) => ({
    ...group,
    academicYearName: group.academicYear?.name ?? '-',
  }))

  return (
    <SimpleEntityManager
      title={t('shell.groups', 'Groups')}
      singularLabel={t('shell.groups', 'Group')}
      items={items}
      columns={[
        { key: 'name', label: t('common.name', 'Name') },
        { key: 'code', label: t('common.code', 'Code') },
        { key: 'academicYearName', label: t('shell.academic_years', 'Academic Years') },
      ]}
      fields={[
        { key: 'name', label: t('shell.groups', 'Group'), type: 'text', required: true },
        { key: 'code', label: t('common.code', 'Code'), type: 'text', required: true },
        {
          key: 'academicYearId',
          label: t('auth.register.academic_year', 'Academic Year'),
          type: 'select',
          required: true,
          options: years.map((year) => ({ value: year.id, label: year.name })),
        },
      ]}
      apiBase="/api/admin/groups"
      canEdit={canManageAll}
      canDelete={canManageAll}
      formMode="modal"
    />
  )
}
