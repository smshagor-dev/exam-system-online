import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import SimpleEntityManager from '@/components/admin/SimpleEntityManager'
import StudentTimelineInspector from '@/components/admin/StudentTimelineInspector'

export default async function EnrollmentsPage() {
  const scope = await getAdminScope()
  const departmentWhere = scope.isSuperAdmin ? undefined : { id: { in: scope.managedDepartmentIds } }
  const studentWhere = scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } }

  const [
    enrollments,
    students,
    departments,
    sessions,
    programs,
    years,
    semesters,
    programYears,
    programSemesters,
    departmentLanguages,
    groups,
  ] = await Promise.all([
    prisma.studentEnrollment.findMany({
      where: scope.isSuperAdmin ? undefined : { departmentId: { in: scope.managedDepartmentIds } },
      include: {
        student: { include: { user: true } },
        department: true,
        academicSession: true,
        program: true,
        programYear: true,
        semester: true,
        programSemester: true,
        group: true,
        academicYear: true,
        departmentLanguage: { include: { language: true } },
        language: true,
      },
      orderBy: [{ isActive: 'desc' }, { enrolledAt: 'desc' }],
    }),
    prisma.studentProfile.findMany({
      where: studentWhere,
      include: { user: true },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.department.findMany({ where: departmentWhere, orderBy: { name: 'asc' } }),
    prisma.academicSession.findMany({ where: { isActive: true }, orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }] }),
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

  const items = enrollments.map((item) => ({
    id: item.id,
    studentId: item.studentId,
    departmentId: item.departmentId,
    academicSessionId: item.academicSessionId,
    programId: item.programId,
    programYearId: item.programYearId,
    semesterId: item.semesterId,
    programSemesterId: item.programSemesterId ?? '',
    groupId: item.groupId,
    academicYearId: item.academicYearId ?? '',
    departmentLanguageId: item.departmentLanguageId ?? '',
    languageId: item.languageId ?? '',
    status: item.status,
    enrolledAt: item.enrolledAt.toISOString().slice(0, 10),
    isActive: item.isActive,
    notes: item.notes ?? '',
    studentName: item.student.user.name,
    departmentName: item.department.name,
    sessionName: item.academicSession.name,
    programName: item.program.name,
    yearName: item.programYear.name,
    semesterName: item.semester.name,
    groupName: item.group.name,
    languageName: item.language?.name ?? item.departmentLanguage?.language.name ?? '-',
  }))

  return (
    <div className="space-y-6">
      <SimpleEntityManager
        title="Student Enrollments"
        singularLabel="Enrollment"
        items={items}
        columns={[
          { key: 'studentName', label: 'Student' },
          { key: 'departmentName', label: 'Department' },
          { key: 'programName', label: 'Program' },
          { key: 'yearName', label: 'Program Year' },
          { key: 'semesterName', label: 'Semester' },
          { key: 'groupName', label: 'Group' },
          { key: 'languageName', label: 'Language' },
          { key: 'status', label: 'Status' },
        ]}
        fields={[
          {
            key: 'studentId',
            label: 'Student',
            type: 'select',
            required: true,
            options: students.map((item) => ({
              value: item.id,
              label: `${item.user.name} (${item.user.email})`,
            })),
          },
          { key: 'departmentId', label: 'Department', type: 'select', required: true, options: departments.map((item) => ({ value: item.id, label: item.name })) },
          { key: 'academicSessionId', label: 'Academic Session', type: 'select', required: true, options: sessions.map((item) => ({ value: item.id, label: item.name })) },
          {
            key: 'programId',
            label: 'Program',
            type: 'select',
            required: true,
            dependsOn: ['departmentId'],
            options: programs.map((item) => ({ value: item.id, label: item.name, meta: { departmentId: item.departmentId } })),
          },
          {
            key: 'programYearId',
            label: 'Program Year',
            type: 'select',
            required: true,
            dependsOn: ['programId'],
            options: programYears.map((item) => ({ value: item.id, label: item.name, meta: { programId: item.programId } })),
          },
          { key: 'academicYearId', label: 'Academic Year', type: 'select', options: years.map((item) => ({ value: item.id, label: item.name })) },
          { key: 'semesterId', label: 'Semester', type: 'select', required: true, options: semesters.map((item) => ({ value: item.id, label: item.name })) },
          {
            key: 'programSemesterId',
            label: 'Program Semester',
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
            label: 'Language',
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
            label: 'Department Language',
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
            label: 'Group',
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
          { key: 'status', label: 'Status', type: 'select', required: true, options: ['ACTIVE', 'DROPPED', 'TRANSFERRED', 'LEAVE', 'GRADUATED', 'ALUMNI'].map((value) => ({ value, label: value })) },
          { key: 'enrolledAt', label: 'Enrollment Date', type: 'date' },
          { key: 'isActive', label: 'Active Enrollment', type: 'checkbox' },
          { key: 'notes', label: 'Notes / Deactivation Reason', type: 'textarea' },
        ]}
        apiBase="/api/admin/enrollments"
        canDelete={false}
        formMode="modal"
      />

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Active academic offerings are synchronized automatically from the selected department, program, session, year, semester, language, and group scope.
      </div>

      <StudentTimelineInspector
        students={students.map((student) => ({
          value: student.id,
          label: `${student.user.name} (${student.user.email})`,
        }))}
      />
    </div>
  )
}
