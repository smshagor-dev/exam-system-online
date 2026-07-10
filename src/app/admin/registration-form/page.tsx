import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import RegistrationFieldManager from './RegistrationFieldManager'

export default async function RegistrationFormPage() {
  await requireRole(UserRole.SUPER_ADMIN)

  const [departments, fields] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: 'asc' },
    }),
    prisma.registrationField.findMany({
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [
        { departmentId: 'asc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    }),
  ])

  const normalizedFields = fields.map((field) => ({
    ...field,
    options: Array.isArray(field.options) ? field.options.filter((option): option is string => typeof option === 'string') : null,
  }))

  return (
    <RegistrationFieldManager
      fields={normalizedFields}
      departments={departments}
      canSelectDepartment
    />
  )
}
