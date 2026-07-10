import { AttemptStatus, ResultStatus, UserRole, type Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type StudentDirectoryContext = {
  userId: string
  role: UserRole
}

export type StudentDirectoryFilters = {
  academicYearId?: string
  groupId?: string
  languageId?: string
}

export type StudentDirectoryItem = {
  id: string
  name: string
  email: string
  isActive: boolean
  departmentName: string
  departmentId: string
  phone?: string | null
  course?: string | null
  enrolledSubjectsCount: number
  attemptsCount: number
  completedAttemptsCount: number
  publishedResultsCount: number
  averageScore: number
  passRate: number
  subjects: Array<{
    id: string
    subject: string
    group: string
    academicYear: string
    language: string
    semester: string
  }>
  customFieldResponses?: Record<string, unknown> | null
}

export type StudentProgressDetail = StudentDirectoryItem & {
  eligibleExamCount: number
  pendingResultCount: number
  latestExamDate?: string | null
  subjectProgressYears: StudentSelfProgressYearGroup[]
  results: Array<{
    id: string
    examTitle: string
    subject: string
    academicYear: string
    percentage: number
    marksObtained: number
    totalMarks: number
    isPassed: boolean
    status: ResultStatus
    publishedAt?: string | null
  }>
  attempts: Array<{
    id: string
    examTitle: string
    subject: string
    status: AttemptStatus
    startedAt?: string | null
    submittedAt?: string | null
    timeSpent?: number | null
    resultPercentage?: number | null
  }>
}

export type StudentSelfProgressSubjectAttempt = {
  id: string
  examTitle: string
  status: AttemptStatus
  startedAt?: string | null
  submittedAt?: string | null
  timeSpent?: number | null
  resultPercentage?: number | null
}

export type StudentSelfProgressSubjectResult = {
  id: string
  examTitle: string
  percentage: number
  marksObtained: number
  totalMarks: number
  isPassed: boolean
  status: ResultStatus
  publishedAt?: string | null
}

export type StudentSelfProgressSubjectDetail = {
  scopeId: string
  subjectName: string
  academicYearName: string
  academicYearNumber: number
  semesterName: string
  groupName: string
  languageName: string
  eligibleExamCount: number
  attemptsCount: number
  completedAttemptsCount: number
  publishedResultsCount: number
  averageScore: number
  passRate: number
  pendingResultCount: number
  latestActivity?: string | null
  attempts: StudentSelfProgressSubjectAttempt[]
  results: StudentSelfProgressSubjectResult[]
}

export type StudentSelfProgressYearGroup = {
  academicYearId: string
  academicYearName: string
  academicYearNumber: number
  subjects: StudentSelfProgressSubjectDetail[]
}

export type StudentSelfProgressOverview = {
  studentName: string
  departmentName: string
  course?: string | null
  totalSubjects: number
  totalEligibleExams: number
  totalPublishedResults: number
  averageScore: number
  years: StudentSelfProgressYearGroup[]
}

export type StudentSelfProgressSubjectPage = {
  studentName: string
  departmentName: string
  course?: string | null
  subject: StudentSelfProgressSubjectDetail
}

function getCourseLabel(course?: string | null) {
  if (course === 'BACHELOR_OF_SCIENCE') return 'Bachelor of Science'
  if (course === 'MASTER_OF_SCIENCE') return 'Master of Science'
  return course ?? null
}

function isCompletedAttempt(status: AttemptStatus) {
  return status === AttemptStatus.SUBMITTED || status === AttemptStatus.AUTO_SUBMITTED
}

function matchesSubjectScope(
  subject: {
    subjectId: string
    languageId: string
    groupId: string
    academicYearId: string
    semesterId: string
  },
  target: {
    subjectId: string
    languageId: string
    groupId: string
    academicYearId: string
    semesterId: string
  }
) {
  return (
    subject.subjectId === target.subjectId &&
    subject.languageId === target.languageId &&
    subject.groupId === target.groupId &&
    subject.academicYearId === target.academicYearId &&
    subject.semesterId === target.semesterId
  )
}

async function getManagedDepartmentIds(userId: string) {
  const departments = await prisma.department.findMany({
    where: { adminId: userId },
    select: { id: true },
  })

  return departments.map((department) => department.id)
}

async function getTeacherAssignments(userId: string) {
  const profile = await prisma.teacherProfile.findUnique({
    where: { userId },
    include: {
      assignments: {
        select: {
          departmentId: true,
          subjectId: true,
          languageId: true,
          groupId: true,
          academicYearId: true,
          semesterId: true,
        },
      },
    },
  })

  return profile?.assignments ?? []
}

async function getStudentProfileWhere(
  ctx: StudentDirectoryContext,
  filters: StudentDirectoryFilters = {}
): Promise<Prisma.StudentProfileWhereInput> {
  const subjectFilter = {
    ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
    ...(filters.groupId ? { groupId: filters.groupId } : {}),
    ...(filters.languageId ? { languageId: filters.languageId } : {}),
  }

  if (ctx.role === UserRole.SUPER_ADMIN) {
    return Object.keys(subjectFilter).length > 0
      ? { subjects: { some: subjectFilter } }
      : {}
  }

  if (ctx.role === UserRole.DEPARTMENT_ADMIN) {
    const managedDepartmentIds = await getManagedDepartmentIds(ctx.userId)
    return {
      departmentId: { in: managedDepartmentIds },
      ...(Object.keys(subjectFilter).length > 0 ? { subjects: { some: subjectFilter } } : {}),
    }
  }

  if (ctx.role === UserRole.TEACHER) {
    const assignments = await getTeacherAssignments(ctx.userId)
    if (assignments.length === 0) {
      return { id: '__no_students__' }
    }

    return {
      departmentId: { in: [...new Set(assignments.map((assignment) => assignment.departmentId))] },
      subjects: {
        some: {
          ...subjectFilter,
          OR: assignments.map((assignment) => ({
            subjectId: assignment.subjectId,
            languageId: assignment.languageId,
            groupId: assignment.groupId,
            academicYearId: assignment.academicYearId,
            semesterId: assignment.semesterId,
          })),
        },
      },
    }
  }

  return { id: '__forbidden__' }
}

export async function getStudentDirectory(
  ctx: StudentDirectoryContext,
  filters: StudentDirectoryFilters = {}
): Promise<StudentDirectoryItem[]> {
  const where = await getStudentProfileWhere(ctx, filters)

  const profiles = await prisma.studentProfile.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
        },
      },
      department: true,
      subjects: {
        include: {
          subject: true,
          group: true,
          academicYear: true,
          language: true,
          semester: true,
        },
      },
      _count: { select: { examAttempts: true } },
    },
  })

  if (profiles.length === 0) return []

  const profileIds = profiles.map((profile) => profile.id)

  const [results, attempts] = await Promise.all([
    prisma.examResult.findMany({
      where: { studentId: { in: profileIds } },
      select: {
        studentId: true,
        percentage: true,
        isPassed: true,
        status: true,
      },
    }),
    prisma.studentExamAttempt.findMany({
      where: { studentId: { in: profileIds } },
      select: {
        studentId: true,
        status: true,
      },
    }),
  ])

  const resultMap = new Map<string, typeof results>()
  results.forEach((result) => {
    const items = resultMap.get(result.studentId) ?? []
    items.push(result)
    resultMap.set(result.studentId, items)
  })

  const attemptMap = new Map<string, typeof attempts>()
  attempts.forEach((attempt) => {
    const items = attemptMap.get(attempt.studentId) ?? []
    items.push(attempt)
    attemptMap.set(attempt.studentId, items)
  })

  return profiles
    .map((profile) => {
      const studentResults = resultMap.get(profile.id) ?? []
      const studentAttempts = attemptMap.get(profile.id) ?? []
      const publishedResults = studentResults.filter((result) => result.status === ResultStatus.PUBLISHED)
      const passCount = publishedResults.filter((result) => result.isPassed).length
      const completedAttempts = studentAttempts.filter((attempt) =>
        attempt.status === AttemptStatus.SUBMITTED || attempt.status === AttemptStatus.AUTO_SUBMITTED
      ).length

      return {
        id: profile.user.id,
        name: profile.user.name,
        email: profile.user.email,
        isActive: profile.user.isActive,
        departmentName: profile.department.name,
        departmentId: profile.departmentId,
        phone: profile.phone,
        course: getCourseLabel(
          typeof profile.customFieldResponses === 'object' &&
            profile.customFieldResponses &&
            'course' in (profile.customFieldResponses as Record<string, unknown>)
            ? String((profile.customFieldResponses as Record<string, unknown>).course)
            : null
        ),
        enrolledSubjectsCount: profile.subjects.length,
        attemptsCount: profile._count.examAttempts,
        completedAttemptsCount: completedAttempts,
        publishedResultsCount: publishedResults.length,
        averageScore: publishedResults.length > 0
          ? publishedResults.reduce((sum, result) => sum + result.percentage, 0) / publishedResults.length
          : 0,
        passRate: publishedResults.length > 0 ? (passCount / publishedResults.length) * 100 : 0,
        subjects: profile.subjects.map((subject) => ({
          id: subject.id,
          subject: subject.subject.name,
          group: subject.group.name,
          academicYear: subject.academicYear.name,
          language: subject.language.name,
          semester: subject.semester.name,
        })),
        customFieldResponses: (profile.customFieldResponses as Record<string, unknown> | null) ?? null,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getStudentProgressDetail(
  ctx: StudentDirectoryContext,
  studentUserId: string
): Promise<StudentProgressDetail | null> {
  const scopeWhere = await getStudentProfileWhere(ctx)

  const profile = await prisma.studentProfile.findFirst({
    where: {
      AND: [
        scopeWhere,
        { userId: studentUserId },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
        },
      },
      department: true,
      subjects: {
        include: {
          subject: true,
          group: true,
          academicYear: true,
          language: true,
          semester: true,
        },
      },
      examAttempts: {
        include: {
          exam: {
            include: {
              subject: true,
              group: true,
              academicYear: true,
              language: true,
              semester: true,
            },
          },
          result: true,
        },
        orderBy: { updatedAt: 'desc' },
      },
      _count: { select: { examAttempts: true } },
    },
  })

  if (!profile) return null

  const results = await prisma.examResult.findMany({
    where: { studentId: profile.id },
    include: {
      exam: {
        include: {
          subject: true,
          group: true,
          academicYear: true,
          language: true,
          semester: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  })
  const eligibleExams = profile.subjects.length > 0
    ? await prisma.exam.findMany({
        where: {
          OR: profile.subjects.map((subject) => ({
            departmentId: profile.departmentId,
            subjectId: subject.subjectId,
            languageId: subject.languageId,
            groupId: subject.groupId,
            academicYearId: subject.academicYearId,
            semesterId: subject.semesterId,
          })),
        },
        select: {
          id: true,
          subjectId: true,
          languageId: true,
          groupId: true,
          academicYearId: true,
          semesterId: true,
        },
      })
    : []

  const eligibleExamCount = profile.subjects.length > 0
    ? await prisma.exam.count({
        where: {
          OR: profile.subjects.map((subject) => ({
            departmentId: profile.departmentId,
            subjectId: subject.subjectId,
            languageId: subject.languageId,
            groupId: subject.groupId,
            academicYearId: subject.academicYearId,
            semesterId: subject.semesterId,
          })),
        },
      })
    : 0

  const publishedResults = results.filter((result) => result.status === ResultStatus.PUBLISHED)
  const passCount = publishedResults.filter((result) => result.isPassed).length
  const completedAttempts = profile.examAttempts.filter((attempt) =>
    attempt.status === AttemptStatus.SUBMITTED || attempt.status === AttemptStatus.AUTO_SUBMITTED
  )

  const latestExamDate = profile.examAttempts.find((attempt) => attempt.submittedAt || attempt.startedAt)
  const scopeMap = new Map<string, {
    scopeId: string
    subjectId: string
    languageId: string
    groupId: string
    academicYearId: string
    semesterId: string
    subjectName: string
    academicYearName: string
    academicYearNumber: number
    semesterName: string
    groupName: string
    languageName: string
  }>()

  for (const subject of profile.subjects) {
    const scopeKey = [
      subject.subjectId,
      subject.languageId,
      subject.groupId,
      subject.academicYearId,
      subject.semesterId,
    ].join(':')

    scopeMap.set(scopeKey, {
      scopeId: subject.id,
      subjectId: subject.subjectId,
      languageId: subject.languageId,
      groupId: subject.groupId,
      academicYearId: subject.academicYearId,
      semesterId: subject.semesterId,
      subjectName: subject.subject.name,
      academicYearName: subject.academicYear.name,
      academicYearNumber: subject.academicYear.year,
      semesterName: subject.semester.name,
      groupName: subject.group.name,
      languageName: subject.language.name,
    })
  }

  for (const attempt of profile.examAttempts) {
    const scopeKey = [
      attempt.exam.subjectId,
      attempt.exam.languageId,
      attempt.exam.groupId,
      attempt.exam.academicYearId,
      attempt.exam.semesterId,
    ].join(':')

    if (!scopeMap.has(scopeKey)) {
      scopeMap.set(scopeKey, {
        scopeId: scopeKey,
        subjectId: attempt.exam.subjectId,
        languageId: attempt.exam.languageId,
        groupId: attempt.exam.groupId,
        academicYearId: attempt.exam.academicYearId,
        semesterId: attempt.exam.semesterId,
        subjectName: attempt.exam.subject.name,
        academicYearName: attempt.exam.academicYear.name,
        academicYearNumber: attempt.exam.academicYear.year,
        semesterName: attempt.exam.semester.name,
        groupName: attempt.exam.group.name,
        languageName: attempt.exam.language.name,
      })
    }
  }

  for (const result of results) {
    const scopeKey = [
      result.exam.subjectId,
      result.exam.languageId,
      result.exam.groupId,
      result.exam.academicYearId,
      result.exam.semesterId,
    ].join(':')

    if (!scopeMap.has(scopeKey)) {
      scopeMap.set(scopeKey, {
        scopeId: scopeKey,
        subjectId: result.exam.subjectId,
        languageId: result.exam.languageId,
        groupId: result.exam.groupId,
        academicYearId: result.exam.academicYearId,
        semesterId: result.exam.semesterId,
        subjectName: result.exam.subject.name,
        academicYearName: result.exam.academicYear.name,
        academicYearNumber: result.exam.academicYear.year,
        semesterName: result.exam.semester.name,
        groupName: result.exam.group.name,
        languageName: result.exam.language.name,
      })
    }
  }

  const subjectProgress = Array.from(scopeMap.values()).map((subject) => {
    const scopeAttempts = profile.examAttempts.filter((attempt) =>
      matchesSubjectScope(subject, attempt.exam)
    )
    const scopeExams = eligibleExams.filter((exam) =>
      matchesSubjectScope(subject, exam)
    )
    const completedScopeAttempts = scopeAttempts.filter((attempt) => isCompletedAttempt(attempt.status))
    const scopeResults = results
      .filter((result) => matchesSubjectScope(subject, result.exam))
      .map((result) => ({
        id: result.id,
        examTitle: result.exam.title,
        percentage: result.percentage,
        marksObtained: result.marksObtained,
        totalMarks: result.totalMarks,
        isPassed: result.isPassed,
        status: result.status,
        publishedAt: result.publishedAt?.toISOString() ?? null,
      }))
    const publishedScopeResults = scopeResults.filter((result) => result.status === ResultStatus.PUBLISHED)
    const latestScopeActivity = scopeAttempts.find((attempt) => attempt.submittedAt || attempt.startedAt)

    return {
      scopeId: subject.scopeId,
      subjectName: subject.subjectName,
      academicYearName: subject.academicYearName,
      academicYearNumber: subject.academicYearNumber,
      semesterName: subject.semesterName,
      groupName: subject.groupName,
      languageName: subject.languageName,
      eligibleExamCount: scopeExams.length,
      attemptsCount: scopeAttempts.length,
      completedAttemptsCount: completedScopeAttempts.length,
      publishedResultsCount: publishedScopeResults.length,
      averageScore: publishedScopeResults.length > 0
        ? publishedScopeResults.reduce((sum, result) => sum + result.percentage, 0) / publishedScopeResults.length
        : 0,
      passRate: publishedScopeResults.length > 0
        ? (publishedScopeResults.filter((result) => result.isPassed).length / publishedScopeResults.length) * 100
        : 0,
      pendingResultCount: scopeResults.filter((result) => result.status !== ResultStatus.PUBLISHED).length,
      latestActivity: latestScopeActivity?.submittedAt?.toISOString() ?? latestScopeActivity?.startedAt?.toISOString() ?? null,
      attempts: scopeAttempts.map((attempt) => ({
        id: attempt.id,
        examTitle: attempt.exam.title,
        status: attempt.status,
        startedAt: attempt.startedAt?.toISOString() ?? null,
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        timeSpent: attempt.timeSpent,
        resultPercentage: attempt.result?.percentage ?? null,
      })),
      results: scopeResults,
    }
  })

  const yearProgressMap = new Map<string, StudentSelfProgressYearGroup>()
  for (const subject of subjectProgress) {
    const existing = yearProgressMap.get(subject.academicYearName)
    if (existing) {
      existing.subjects.push(subject)
      continue
    }

    yearProgressMap.set(subject.academicYearName, {
      academicYearId: subject.academicYearName,
      academicYearName: subject.academicYearName,
      academicYearNumber: subject.academicYearNumber,
      subjects: [subject],
    })
  }

  const subjectProgressYears = Array.from(yearProgressMap.values())
    .sort((a, b) => a.academicYearNumber - b.academicYearNumber)
    .map((year) => ({
      ...year,
      subjects: year.subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
    }))

  return {
    id: profile.user.id,
    name: profile.user.name,
    email: profile.user.email,
    isActive: profile.user.isActive,
    departmentName: profile.department.name,
    departmentId: profile.departmentId,
    phone: profile.phone,
    course: getCourseLabel(
      typeof profile.customFieldResponses === 'object' &&
        profile.customFieldResponses &&
        'course' in (profile.customFieldResponses as Record<string, unknown>)
        ? String((profile.customFieldResponses as Record<string, unknown>).course)
        : null
    ),
    enrolledSubjectsCount: profile.subjects.length,
    attemptsCount: profile._count.examAttempts,
    completedAttemptsCount: completedAttempts.length,
    publishedResultsCount: publishedResults.length,
    averageScore: publishedResults.length > 0
      ? publishedResults.reduce((sum, result) => sum + result.percentage, 0) / publishedResults.length
      : 0,
    passRate: publishedResults.length > 0 ? (passCount / publishedResults.length) * 100 : 0,
    subjects: profile.subjects.map((subject) => ({
      id: subject.id,
      subject: subject.subject.name,
      group: subject.group.name,
      academicYear: subject.academicYear.name,
      language: subject.language.name,
      semester: subject.semester.name,
    })),
    customFieldResponses: (profile.customFieldResponses as Record<string, unknown> | null) ?? null,
    eligibleExamCount,
    pendingResultCount: results.filter((result) => result.status !== ResultStatus.PUBLISHED).length,
    latestExamDate: latestExamDate?.submittedAt?.toISOString() ?? latestExamDate?.startedAt?.toISOString() ?? null,
    subjectProgressYears,
    results: results.map((result) => ({
      id: result.id,
      examTitle: result.exam.title,
      subject: result.exam.subject.name,
      academicYear: result.exam.academicYear.name,
      percentage: result.percentage,
      marksObtained: result.marksObtained,
      totalMarks: result.totalMarks,
      isPassed: result.isPassed,
      status: result.status,
      publishedAt: result.publishedAt?.toISOString() ?? null,
    })),
    attempts: profile.examAttempts.map((attempt) => ({
      id: attempt.id,
      examTitle: attempt.exam.title,
      subject: attempt.exam.subject.name,
      status: attempt.status,
      startedAt: attempt.startedAt?.toISOString() ?? null,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      timeSpent: attempt.timeSpent,
      resultPercentage: attempt.result?.percentage ?? null,
    })),
  }
}

export async function getStudentSelfProgress(userId: string): Promise<StudentSelfProgressOverview | null> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          name: true,
        },
      },
      department: true,
      subjects: {
        include: {
          subject: true,
          group: true,
          academicYear: true,
          language: true,
          semester: true,
        },
        orderBy: [
          { academicYear: { year: 'asc' } },
          { subject: { name: 'asc' } },
        ],
      },
      examAttempts: {
        include: {
          exam: true,
          result: true,
        },
        orderBy: { updatedAt: 'desc' },
      },
    },
  })

  if (!profile) return null

  const eligibleExams = profile.subjects.length > 0
    ? await prisma.exam.findMany({
        where: {
          OR: profile.subjects.map((subject) => ({
            departmentId: profile.departmentId,
            subjectId: subject.subjectId,
            languageId: subject.languageId,
            groupId: subject.groupId,
            academicYearId: subject.academicYearId,
            semesterId: subject.semesterId,
          })),
        },
        select: {
          id: true,
          subjectId: true,
          languageId: true,
          groupId: true,
          academicYearId: true,
          semesterId: true,
        },
      })
    : []

  const subjectDetails = profile.subjects.map((subject) => {
    const scopeExams = eligibleExams.filter((exam) =>
      matchesSubjectScope(subject, exam)
    )
    const scopeAttempts = profile.examAttempts.filter((attempt) =>
      matchesSubjectScope(subject, attempt.exam)
    )
    const completedAttempts = scopeAttempts.filter((attempt) => isCompletedAttempt(attempt.status))
    const scopeResults = scopeAttempts
      .map((attempt) => attempt.result ? {
        id: attempt.result.id,
        examTitle: attempt.exam.title,
        percentage: attempt.result.percentage,
        marksObtained: attempt.result.marksObtained,
        totalMarks: attempt.result.totalMarks,
        isPassed: attempt.result.isPassed,
        status: attempt.result.status,
        publishedAt: attempt.result.publishedAt?.toISOString() ?? null,
      } : null)
      .filter((result): result is StudentSelfProgressSubjectResult => Boolean(result))
    const publishedResults = scopeResults.filter((result) => result.status === ResultStatus.PUBLISHED)
    const latestActivity = scopeAttempts.find((attempt) => attempt.submittedAt || attempt.startedAt)

    return {
      scopeId: subject.id,
      subjectName: subject.subject.name,
      academicYearName: subject.academicYear.name,
      academicYearNumber: subject.academicYear.year,
      semesterName: subject.semester.name,
      groupName: subject.group.name,
      languageName: subject.language.name,
      eligibleExamCount: scopeExams.length,
      attemptsCount: scopeAttempts.length,
      completedAttemptsCount: completedAttempts.length,
      publishedResultsCount: publishedResults.length,
      averageScore: publishedResults.length > 0
        ? publishedResults.reduce((sum, result) => sum + result.percentage, 0) / publishedResults.length
        : 0,
      passRate: publishedResults.length > 0
        ? (publishedResults.filter((result) => result.isPassed).length / publishedResults.length) * 100
        : 0,
      pendingResultCount: scopeResults.filter((result) => result.status !== ResultStatus.PUBLISHED).length,
      latestActivity: latestActivity?.submittedAt?.toISOString() ?? latestActivity?.startedAt?.toISOString() ?? null,
      attempts: scopeAttempts.map((attempt) => ({
        id: attempt.id,
        examTitle: attempt.exam.title,
        status: attempt.status,
        startedAt: attempt.startedAt?.toISOString() ?? null,
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        timeSpent: attempt.timeSpent,
        resultPercentage: attempt.result?.percentage ?? null,
      })),
      results: scopeResults,
    }
  })

  const yearMap = new Map<string, StudentSelfProgressYearGroup>()
  for (const subject of subjectDetails) {
    const sourceSubject = profile.subjects.find((item) => item.id === subject.scopeId)
    if (!sourceSubject) continue

    const existing = yearMap.get(sourceSubject.academicYearId)
    if (existing) {
      existing.subjects.push(subject)
      continue
    }

    yearMap.set(sourceSubject.academicYearId, {
      academicYearId: sourceSubject.academicYearId,
      academicYearName: subject.academicYearName,
      academicYearNumber: subject.academicYearNumber,
      subjects: [subject],
    })
  }

  const years = Array.from(yearMap.values())
    .sort((a, b) => a.academicYearNumber - b.academicYearNumber)
    .map((year) => ({
      ...year,
      subjects: year.subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
    }))

  const allPublishedResults = subjectDetails.flatMap((subject) => subject.results.filter((result) => result.status === ResultStatus.PUBLISHED))

  return {
    studentName: profile.user.name,
    departmentName: profile.department.name,
    course: getCourseLabel(
      typeof profile.customFieldResponses === 'object' &&
        profile.customFieldResponses &&
        'course' in (profile.customFieldResponses as Record<string, unknown>)
        ? String((profile.customFieldResponses as Record<string, unknown>).course)
        : null
    ),
    totalSubjects: subjectDetails.length,
    totalEligibleExams: subjectDetails.reduce((sum, subject) => sum + subject.eligibleExamCount, 0),
    totalPublishedResults: allPublishedResults.length,
    averageScore: allPublishedResults.length > 0
      ? allPublishedResults.reduce((sum, result) => sum + result.percentage, 0) / allPublishedResults.length
      : 0,
    years,
  }
}

export async function getStudentSelfProgressSubject(
  userId: string,
  scopeId: string
): Promise<StudentSelfProgressSubjectPage | null> {
  const overview = await getStudentSelfProgress(userId)
  if (!overview) return null

  const subject = overview.years
    .flatMap((year) => year.subjects)
    .find((item) => item.scopeId === scopeId)

  if (!subject) return null

  return {
    studentName: overview.studentName,
    departmentName: overview.departmentName,
    course: overview.course,
    subject,
  }
}
