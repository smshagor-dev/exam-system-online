import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function ProgramSemestersPage() {
  const scope = await getAdminScope()
  const [itemsRaw, programs, programYears, semesters] = await Promise.all([
    prisma.programSemester.findMany({
      where: scope.isSuperAdmin ? undefined : { program: { departmentId: { in: scope.managedDepartmentIds } } },
      include: { program: true, programYear: true, semester: true },
      orderBy: [{ program: { name: 'asc' } }, { semesterNumber: 'asc' }],
    }),
    prisma.academicProgram.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.programYear.findMany({
      where: scope.isSuperAdmin ? undefined : { program: { departmentId: { in: scope.managedDepartmentIds } } },
      orderBy: [{ programId: 'asc' }, { yearNumber: 'asc' }],
    }),
    prisma.semester.findMany({ where: { isActive: true }, orderBy: { number: 'asc' } }),
  ])

  const items = itemsRaw.map((item) => ({
    ...item,
    programName: item.program.name,
    programYearName: item.programYear.name,
    semesterName: item.semester.name,
  }))

  return (
    <SimpleEntityManager
      title="Program Semesters"
      singularLabel="Program Semester"
      items={items}
      columns={[
        { key: 'programName', label: 'Program' },
        { key: 'programYearName', label: 'Program Year' },
        { key: 'semesterName', label: 'Semester' },
        { key: 'semesterNumber', label: 'Semester Number' },
      ]}
      fields={[
        {
          key: 'programId',
          label: 'Program',
          type: 'select',
          required: true,
          options: programs.map((program) => ({ value: program.id, label: program.name })),
        },
        {
          key: 'programYearId',
          label: 'Program Year',
          type: 'select',
          required: true,
          dependsOn: ['programId'],
          options: programYears.map((programYear) => ({
            value: programYear.id,
            label: programYear.name,
            meta: { programId: programYear.programId },
          })),
        },
        {
          key: 'semesterId',
          label: 'Semester',
          type: 'select',
          required: true,
          options: semesters.map((semester) => ({ value: semester.id, label: semester.name })),
        },
        { key: 'semesterNumber', label: 'Semester Number', type: 'number', required: true },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      apiBase="/api/admin/program-semesters"
      formMode="modal"
    />
  )
}
