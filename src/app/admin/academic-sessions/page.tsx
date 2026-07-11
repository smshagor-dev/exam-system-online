import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

function formatDateTime(value: Date | null) {
  return value ? new Date(value).toISOString().slice(0, 16) : ''
}

export default async function AcademicSessionsPage() {
  await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)
  const itemsRaw = await prisma.academicSession.findMany({ orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }] })
  const items = itemsRaw.map((item) => ({
    ...item,
    startDate: formatDateTime(item.startDate),
    endDate: formatDateTime(item.endDate),
    admissionStartDate: formatDateTime(item.admissionStartDate),
    admissionEndDate: formatDateTime(item.admissionEndDate),
  }))

  return (
    <SimpleEntityManager
      title="Academic Sessions"
      singularLabel="Academic Session"
      items={items}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'isCurrent', label: 'Current' },
        { key: 'isActive', label: 'Active' },
      ]}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', required: true },
        { key: 'startDate', label: 'Start Date', type: 'datetime-local', required: true },
        { key: 'endDate', label: 'End Date', type: 'datetime-local', required: true },
        { key: 'admissionStartDate', label: 'Admission Start', type: 'datetime-local' },
        { key: 'admissionEndDate', label: 'Admission End', type: 'datetime-local' },
        { key: 'isCurrent', label: 'Current Session', type: 'checkbox' },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      apiBase="/api/admin/academic-sessions"
      formMode="modal"
    />
  )
}
