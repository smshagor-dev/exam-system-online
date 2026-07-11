import { Prisma } from '@prisma/client'
import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import StudentLifecycleActionWorkspace from '@/components/admin/StudentLifecycleActionWorkspace'

export default async function ReadmissionsPage() {
  const scope = await getAdminScope()
  const openLeaveWhere: Prisma.StudentLeaveWhereInput = {
    OR: [
      { readmittedAt: null },
      { readmittedAt: { isSet: false } },
    ],
  }

  const [openLeaves, sessions, departments, programs, years, semesters, programYears, programSemesters, departmentLanguages, groups] = await Promise.all([
    prisma.studentLeave.findMany({
      where: {
        ...openLeaveWhere,
        ...(scope.isSuperAdmin ? {} : { enrollment: { departmentId: { in: scope.managedDepartmentIds } } }),
      },
      include: {
        student: { include: { user: true } },
        enrollment: { include: { program: true, programYear: true, semester: true, group: true } },
      },
      orderBy: { approvedAt: 'desc' },
    }),
    prisma.academicSession.findMany({ where: { isActive: true }, orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }] }),
    prisma.department.findMany({ where: scope.isSuperAdmin ? undefined : { id: { in: scope.managedDepartmentIds } }, orderBy: { name: 'asc' } }),
    prisma.academicProgram.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
    prisma.academicYear.findMany({ orderBy: { year: 'asc' } }),
    prisma.semester.findMany({ where: { isActive: true }, orderBy: { number: 'asc' } }),
    prisma.programYear.findMany({
      where: scope.isSuperAdmin ? undefined : { program: { departmentId: { in: scope.managedDepartmentIds } } },
      orderBy: [{ programId: 'asc' }, { yearNumber: 'asc' }],
    }),
    prisma.programSemester.findMany({
      where: scope.isSuperAdmin ? undefined : { program: { departmentId: { in: scope.managedDepartmentIds } } },
      orderBy: [{ programId: 'asc' }, { semesterNumber: 'asc' }],
    }),
    prisma.departmentLanguage.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: { language: true },
      orderBy: [{ departmentId: 'asc' }, { language: { name: 'asc' } }],
    }),
    prisma.group.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      orderBy: { name: 'asc' },
    }),
  ])

  return (
    <StudentLifecycleActionWorkspace
      title="Readmission Workflow"
      description="Readmit eligible students from leave into a validated academic context, close the leave record, and create a new active enrollment."
      actionEndpoint="/api/admin/readmissions"
      actionLabel="Create readmission"
      fields={[
        {
          key: 'studentId',
          label: 'Student on Leave',
          type: 'select',
          required: true,
          options: openLeaves.map((item) => ({
            value: item.studentId,
            label: `${item.student.user.name} (${item.enrollment.program.name} / ${item.enrollment.group.name})`,
          })),
        },
        { key: 'departmentId', label: 'Return Department', type: 'select', required: true, options: departments.map((item) => ({ value: item.id, label: item.name })) },
        { key: 'academicSessionId', label: 'Return Session', type: 'select', required: true, options: sessions.map((item) => ({ value: item.id, label: item.name })) },
        {
          key: 'programId',
          label: 'Return Program',
          type: 'select',
          required: true,
          dependsOn: ['departmentId'],
          options: programs.map((item) => ({ value: item.id, label: item.name, meta: { departmentId: item.departmentId } })),
        },
        {
          key: 'programYearId',
          label: 'Return Program Year',
          type: 'select',
          required: true,
          dependsOn: ['programId'],
          options: programYears.map((item) => ({ value: item.id, label: item.name, meta: { programId: item.programId } })),
        },
        { key: 'academicYearId', label: 'Academic Year', type: 'select', options: years.map((item) => ({ value: item.id, label: item.name })) },
        { key: 'semesterId', label: 'Return Semester', type: 'select', required: true, options: semesters.map((item) => ({ value: item.id, label: item.name })) },
        {
          key: 'programSemesterId',
          label: 'Return Program Semester',
          type: 'select',
          dependsOn: ['programId', 'programYearId', 'semesterId'],
          options: programSemesters.map((item) => ({
            value: item.id,
            label: `Semester #${item.semesterNumber}`,
            meta: { programId: item.programId, programYearId: item.programYearId, semesterId: item.semesterId },
          })),
        },
        {
          key: 'languageId',
          label: 'Return Language',
          type: 'select',
          dependsOn: ['departmentId'],
          options: departmentLanguages.map((item) => ({
            value: item.languageId,
            label: item.language.name,
            meta: { departmentId: item.departmentId },
          })),
        },
        {
          key: 'departmentLanguageId',
          label: 'Return Department Language',
          type: 'select',
          dependsOn: ['departmentId', 'languageId'],
          options: departmentLanguages.map((item) => ({
            value: item.id,
            label: item.language.name,
            meta: { departmentId: item.departmentId, languageId: item.languageId },
          })),
        },
        {
          key: 'groupId',
          label: 'Return Group',
          type: 'select',
          required: true,
          dependsOn: ['departmentId', 'programId', 'academicSessionId', 'programYearId'],
          options: groups.map((item) => ({
            value: item.id,
            label: item.name,
            meta: {
              departmentId: item.departmentId ?? '',
              programId: item.programId ?? '',
              academicSessionId: item.academicSessionId ?? '',
              programYearId: item.programYearId ?? '',
            },
          })),
        },
        { key: 'readmittedAt', label: 'Effective Date', type: 'date' },
        { key: 'approvalReason', label: 'Approval Reason', type: 'textarea' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]}
      recordsTitle="Students Awaiting Readmission"
      recordsDescription="Open leave records that can be used for controlled readmission."
      columns={[
        { key: 'student', label: 'Student' },
        { key: 'program', label: 'Prior Program' },
        { key: 'year', label: 'Prior Year' },
        { key: 'semester', label: 'Prior Semester' },
        { key: 'group', label: 'Prior Group' },
        { key: 'leaveType', label: 'Leave Type' },
        { key: 'startsAt', label: 'Leave Started' },
      ]}
      rows={openLeaves.map((item) => ({
        student: item.student.user.name,
        program: item.enrollment.program.name,
        year: item.enrollment.programYear.name,
        semester: item.enrollment.semester.name,
        group: item.enrollment.group.name,
        leaveType: item.leaveType,
        startsAt: item.startsAt.toISOString().slice(0, 10),
      }))}
    />
  )
}
