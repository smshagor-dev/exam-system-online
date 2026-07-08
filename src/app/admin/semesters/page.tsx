import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function SemestersPage() {
  await requireRole(UserRole.SUPER_ADMIN)
  const semesters = await prisma.semester.findMany({ orderBy: { number: 'asc' } })

  return (
    <SimpleEntityManager
      title="Semesters"
      items={semesters}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'number', label: 'Semester Number' },
      ]}
      fields={[
        { key: 'name', label: 'Display Name (e.g. "Semester 1")', type: 'text', required: true },
        { key: 'number', label: 'Semester Number', type: 'number', required: true },
      ]}
      apiBase="/api/admin/semesters"
    />
  )
}
