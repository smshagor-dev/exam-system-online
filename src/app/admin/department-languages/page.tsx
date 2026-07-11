import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function DepartmentLanguagesPage() {
  const scope = await getAdminScope()
  const [itemsRaw, departments, languages] = await Promise.all([
    prisma.departmentLanguage.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: { department: true, language: true },
      orderBy: [{ department: { name: 'asc' } }, { language: { name: 'asc' } }],
    }),
    prisma.department.findMany({
      where: scope.isSuperAdmin ? undefined : { id: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.language.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  ])

  const items = itemsRaw.map((item) => ({
    ...item,
    departmentName: item.department.name,
    languageName: item.language.name,
  }))

  return (
    <SimpleEntityManager
      title="Department Languages"
      singularLabel="Department Language"
      items={items}
      columns={[
        { key: 'departmentName', label: 'Department' },
        { key: 'languageName', label: 'Language' },
        { key: 'isActive', label: 'Active' },
      ]}
      fields={[
        {
          key: 'departmentId',
          label: 'Department',
          type: 'select',
          required: true,
          options: departments.map((department) => ({ value: department.id, label: department.name })),
        },
        {
          key: 'languageId',
          label: 'Language',
          type: 'select',
          required: true,
          options: languages.map((language) => ({ value: language.id, label: language.name })),
        },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      apiBase="/api/admin/department-languages"
      formMode="modal"
    />
  )
}

