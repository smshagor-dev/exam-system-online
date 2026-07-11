import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'

export default async function GroupsPage() {
  const scope = await getAdminScope()
  const [groups, years, departments, programs, departmentLanguages, sessions, programYears, programSemesters] = await Promise.all([
    prisma.group.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: {
        academicYear: true,
        department: true,
        program: true,
        language: true,
        academicSession: true,
        programYear: true,
        currentProgramSemester: true,
      },
      orderBy: [{ academicYear: { year: 'asc' } }, { name: 'asc' }],
    }),
    prisma.academicYear.findMany({ orderBy: { year: 'asc' } }),
    prisma.department.findMany({
      where: scope.isSuperAdmin ? undefined : { id: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.academicProgram.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.departmentLanguage.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: { department: true, language: true },
      orderBy: [{ department: { name: 'asc' } }, { language: { name: 'asc' } }],
    }),
    prisma.academicSession.findMany({ where: { isActive: true }, orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }] }),
    prisma.programYear.findMany({
      where: scope.isSuperAdmin ? undefined : { program: { departmentId: { in: scope.managedDepartmentIds } } },
      include: { program: true },
      orderBy: [{ programId: 'asc' }, { yearNumber: 'asc' }],
    }),
    prisma.programSemester.findMany({
      where: scope.isSuperAdmin ? undefined : { program: { departmentId: { in: scope.managedDepartmentIds } } },
      orderBy: [{ programId: 'asc' }, { semesterNumber: 'asc' }],
    }),
  ])
  const items = groups.map((group) => ({
    ...group,
    academicYearName: group.academicYear?.name ?? '-',
    departmentName: group.department?.name ?? '-',
    programName: group.program?.name ?? '-',
    languageName: group.language?.name ?? '-',
    sessionName: group.academicSession?.name ?? '-',
    programYearName: group.programYear?.name ?? '-',
  }))

  return (
    <SimpleEntityManager
      title="Groups"
      singularLabel="Group"
      items={items}
      columns={[
        { key: 'name', label: 'Name' },
        { key: 'code', label: 'Code' },
        { key: 'departmentName', label: 'Department' },
        { key: 'programName', label: 'Program' },
        { key: 'languageName', label: 'Language' },
        { key: 'programYearName', label: 'Program Year' },
        { key: 'sessionName', label: 'Session' },
      ]}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', required: true },
        {
          key: 'departmentId',
          label: 'Department',
          type: 'select',
          required: true,
          options: departments.map((department) => ({ value: department.id, label: department.name })),
        },
        {
          key: 'programId',
          label: 'Program',
          type: 'select',
          required: true,
          dependsOn: ['departmentId'],
          options: programs.map((program) => ({ value: program.id, label: program.name, meta: { departmentId: program.departmentId } })),
        },
        {
          key: 'languageId',
          label: 'Language',
          type: 'select',
          required: true,
          dependsOn: ['departmentId'],
          options: departmentLanguages.map((item) => ({
            value: item.languageId,
            label: item.language.name,
            meta: { departmentId: item.departmentId },
          })),
        },
        {
          key: 'departmentLanguageId',
          label: 'Department Language',
          type: 'select',
          dependsOn: ['departmentId', 'languageId'],
          options: departmentLanguages.map((item) => ({
            value: item.id,
            label: `${item.department.name} / ${item.language.name}`,
            meta: { departmentId: item.departmentId, languageId: item.languageId },
          })),
        },
        {
          key: 'academicSessionId',
          label: 'Academic Session',
          type: 'select',
          required: true,
          options: sessions.map((session) => ({ value: session.id, label: session.name })),
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
          key: 'academicYearId',
          label: 'Academic Year',
          type: 'select',
          required: true,
          dependsOn: ['programYearId'],
          options: programYears.flatMap((programYear) =>
            years
              .filter((year) => year.year === programYear.yearNumber)
              .map((year) => ({
                value: year.id,
                label: year.name,
                meta: { programYearId: programYear.id },
              }))
          ),
        },
        {
          key: 'currentProgramSemesterId',
          label: 'Current Program Semester',
          type: 'select',
          dependsOn: ['programId', 'programYearId'],
          options: programSemesters.map((programSemester) => ({
            value: programSemester.id,
            label: `#${programSemester.semesterNumber}`,
            meta: { programId: programSemester.programId, programYearId: programSemester.programYearId },
          })),
        },
        { key: 'isActive', label: 'Active', type: 'checkbox' },
      ]}
      apiBase="/api/admin/groups"
      formMode="modal"
    />
  )
}
