import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function AcademicYearsPage() {
  await requireRole(UserRole.SUPER_ADMIN)
  const years = await prisma.academicYear.findMany({ orderBy: { year: 'asc' } })

  return (
    <SimpleEntityManager
      title="Academic Years"
      items={years}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'year', label: 'Year Number' },
      ]}
      fields={[
        { key: 'name', label: 'Display Name (e.g. "Year 1")', type: 'text', required: true },
        { key: 'year', label: 'Year Number', type: 'number', required: true },
      ]}
      apiBase="/api/admin/years"
    />
  )
}
