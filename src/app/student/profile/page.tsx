import StudentProfileEditor from '@/components/account/StudentProfileEditor'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getActiveRegistrationFields } from '@/lib/registration-fields'
import { UserRole } from '@prisma/client'

export default async function StudentProfilePage() {
  const session = await requireRole(UserRole.STUDENT)
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      role: true,
      avatarUrl: true,
      studentProfile: {
        select: {
          phone: true,
          departmentId: true,
          customFieldResponses: true,
          subjects: {
            take: 1,
            orderBy: { createdAt: 'asc' },
            select: {
              subjectId: true,
              languageId: true,
              groupId: true,
              academicYearId: true,
              semesterId: true,
            },
          },
        },
      },
    },
  })

  if (!user?.studentProfile) {
    throw new Error('User not found')
  }

  const primarySubject = user.studentProfile.subjects[0]
  const customFieldResponses =
    user.studentProfile.customFieldResponses &&
    typeof user.studentProfile.customFieldResponses === 'object' &&
    !Array.isArray(user.studentProfile.customFieldResponses)
      ? (user.studentProfile.customFieldResponses as Record<string, string | boolean>)
      : {}

  const [departments, languages, years, semesters, subjects, groups, customFields] = await Promise.all([
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.language.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.academicYear.findMany({
      where: { isActive: true },
      orderBy: { year: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.semester.findMany({
      where: { isActive: true },
      orderBy: { number: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.subject.findMany({
      where: { departmentId: user.studentProfile.departmentId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    primarySubject?.academicYearId
      ? prisma.group.findMany({
          where: { academicYearId: primarySubject.academicYearId, isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, academicYearId: true },
        })
      : Promise.resolve([]),
    getActiveRegistrationFields(user.studentProfile.departmentId),
  ])

  return (
    <StudentProfileEditor
      title="Student Profile"
      description="Update your account details, academic information, and profile image."
      initialUser={{
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
      }}
      initialAcademic={{
        phone: user.studentProfile.phone ?? '',
        course: typeof customFieldResponses.course === 'string' ? customFieldResponses.course : '',
        departmentId: user.studentProfile.departmentId,
        subjectId: primarySubject?.subjectId ?? '',
        languageId: primarySubject?.languageId ?? '',
        groupId: primarySubject?.groupId ?? '',
        academicYearId: primarySubject?.academicYearId ?? '',
        semesterId: primarySubject?.semesterId ?? '',
        customFieldResponses: Object.fromEntries(
          Object.entries(customFieldResponses).filter(([key]) => key !== 'course')
        ),
      }}
      departments={departments}
      languages={languages}
      years={years}
      semesters={semesters}
      initialSubjects={subjects}
      initialGroups={groups}
      initialCustomFields={customFields.map((field) => ({
        id: field.id,
        label: field.label,
        key: field.key,
        type: field.type,
        isRequired: field.isRequired,
        placeholder: field.placeholder,
        options: Array.isArray(field.options) ? field.options.filter((option): option is string => typeof option === 'string') : null,
      }))}
    />
  )
}
