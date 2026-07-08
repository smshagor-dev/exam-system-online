import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function LanguagesPage() {
  await requireRole(UserRole.SUPER_ADMIN)

  const languageRecords = await prisma.language.findMany({ orderBy: { name: 'asc' } })
  const languages = languageRecords.map((language) => ({
    ...language,
    activeStatus: language.isActive ? 'Yes' : 'No',
  }))

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code' },
    { key: 'activeStatus', label: 'Active' },
  ]

  const fields = [
    { key: 'name', label: 'Language Name', type: 'text' as const, required: true },
    { key: 'code', label: 'Code (e.g. EN)', type: 'text' as const, required: true },
  ]

  return (
    <SimpleEntityManager
      title="Languages"
      items={languages}
      columns={columns}
      fields={fields}
      apiBase="/api/admin/languages"
    />
  )
}
