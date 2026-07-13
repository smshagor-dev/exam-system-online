import { randomUUID } from 'node:crypto'
import {
  CourseworkGradeStatus,
  Phase8AttendanceStatus,
  Phase9AcademicStandingStatus,
  Phase9AppealStatus,
  Phase9CertificateType,
  Phase9DocumentStatus,
  Phase9GradeComponentType,
  Phase9GraduationWorkflowStatus,
  Phase9MarksheetType,
  Phase9ResultLifecycleStatus,
  UserRole,
} from '@prisma/client'
import { graduateStudent } from './student-lifecycle'
import { buildCsv } from './csv'
import { buildSimplePdf, persistPrivatePdf } from './pdf'
import { prisma } from './prisma'

type GradeBand = {
  label: string
  minPercentage: number
  maxPercentage: number
  gradePoint: number
  isPassing: boolean
}

type Phase9Actor = {
  userId?: string | null
  notes?: string | null
}

const RESULT_TRANSITIONS: Record<Phase9ResultLifecycleStatus, Phase9ResultLifecycleStatus[]> = {
  DRAFT: [Phase9ResultLifecycleStatus.DRAFT, Phase9ResultLifecycleStatus.CALCULATED],
  CALCULATED: [Phase9ResultLifecycleStatus.CALCULATED, Phase9ResultLifecycleStatus.VERIFIED],
  VERIFIED: [Phase9ResultLifecycleStatus.VERIFIED, Phase9ResultLifecycleStatus.MODERATED],
  MODERATED: [Phase9ResultLifecycleStatus.MODERATED, Phase9ResultLifecycleStatus.APPROVED],
  APPROVED: [Phase9ResultLifecycleStatus.APPROVED, Phase9ResultLifecycleStatus.PUBLISHED],
  PUBLISHED: [Phase9ResultLifecycleStatus.PUBLISHED, Phase9ResultLifecycleStatus.ARCHIVED],
  ARCHIVED: [Phase9ResultLifecycleStatus.ARCHIVED],
}

const GRADUATION_TRANSITIONS: Record<Phase9GraduationWorkflowStatus, Phase9GraduationWorkflowStatus[]> = {
  ELIGIBLE: [Phase9GraduationWorkflowStatus.ELIGIBLE, Phase9GraduationWorkflowStatus.PENDING, Phase9GraduationWorkflowStatus.APPROVED],
  PENDING: [Phase9GraduationWorkflowStatus.PENDING, Phase9GraduationWorkflowStatus.APPROVED],
  APPROVED: [Phase9GraduationWorkflowStatus.APPROVED, Phase9GraduationWorkflowStatus.CERTIFIED],
  CERTIFIED: [Phase9GraduationWorkflowStatus.CERTIFIED, Phase9GraduationWorkflowStatus.ARCHIVED],
  ARCHIVED: [Phase9GraduationWorkflowStatus.ARCHIVED],
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function phase9Code(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
}

async function ensureDefaultScaleAndPolicy(departmentId: string) {
  const existingPolicy = await prisma.phase9ResultPolicy.findUnique({
    where: { departmentId },
    include: {
      gradingScale: {
        include: {
          bands: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  })

  if (existingPolicy) {
    return existingPolicy
  }

  const scale = await prisma.phase9GradingScale.create({
    data: {
      departmentId,
      name: 'Default 4.00 Scale',
      code: 'DEFAULT-4',
      isDefault: true,
      maximumGpa: 4,
      passPercentage: 40,
      bands: {
        create: [
          { label: 'A+', minPercentage: 80, maxPercentage: 100, gradePoint: 4, isPassing: true, sortOrder: 0 },
          { label: 'A', minPercentage: 75, maxPercentage: 79.99, gradePoint: 3.75, isPassing: true, sortOrder: 1 },
          { label: 'A-', minPercentage: 70, maxPercentage: 74.99, gradePoint: 3.5, isPassing: true, sortOrder: 2 },
          { label: 'B+', minPercentage: 65, maxPercentage: 69.99, gradePoint: 3.25, isPassing: true, sortOrder: 3 },
          { label: 'B', minPercentage: 60, maxPercentage: 64.99, gradePoint: 3, isPassing: true, sortOrder: 4 },
          { label: 'B-', minPercentage: 55, maxPercentage: 59.99, gradePoint: 2.75, isPassing: true, sortOrder: 5 },
          { label: 'C+', minPercentage: 50, maxPercentage: 54.99, gradePoint: 2.5, isPassing: true, sortOrder: 6 },
          { label: 'C', minPercentage: 45, maxPercentage: 49.99, gradePoint: 2.25, isPassing: true, sortOrder: 7 },
          { label: 'D', minPercentage: 40, maxPercentage: 44.99, gradePoint: 2, isPassing: true, sortOrder: 8 },
          { label: 'F', minPercentage: 0, maxPercentage: 39.99, gradePoint: 0, isPassing: false, sortOrder: 9 },
        ],
      },
    },
    include: {
      bands: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  return prisma.phase9ResultPolicy.create({
    data: {
      departmentId,
      gradingScaleId: scale.id,
      passingPercentage: 40,
      goodStandingMinCgpa: 3,
      warningMinCgpa: 2.5,
      probationMinCgpa: 2,
      suspendedMaxFailures: 3,
      dismissedMaxFailures: 5,
      graduationMinCgpa: 2.5,
      graduationMinimumCredits: 0,
      allowRepeatCourseReplacement: true,
      allowImprovementReplacement: true,
    },
    include: {
      gradingScale: {
        include: {
          bands: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  })
}

function resolveBand(percentage: number, bands: GradeBand[]) {
  return (
    bands.find((band) => percentage >= band.minPercentage && percentage <= band.maxPercentage) ??
    bands[bands.length - 1]
  )
}

function resolveStanding(
  cgpa: number,
  failedCourseCount: number,
  policy: {
    goodStandingMinCgpa: number
    warningMinCgpa: number
    probationMinCgpa: number
    suspendedMaxFailures: number
    dismissedMaxFailures: number
  },
  graduated = false
) {
  if (graduated) return Phase9AcademicStandingStatus.GRADUATED
  if (failedCourseCount >= policy.dismissedMaxFailures) return Phase9AcademicStandingStatus.DISMISSED
  if (failedCourseCount >= policy.suspendedMaxFailures) return Phase9AcademicStandingStatus.SUSPENDED
  if (cgpa >= policy.goodStandingMinCgpa) return Phase9AcademicStandingStatus.GOOD_STANDING
  if (cgpa >= policy.warningMinCgpa) return Phase9AcademicStandingStatus.WARNING
  if (cgpa >= policy.probationMinCgpa) return Phase9AcademicStandingStatus.PROBATION
  return Phase9AcademicStandingStatus.SUSPENDED
}

async function getStudentCourseworkMarks(academicOfferingId: string, studentId: string, maxMarks: number) {
  const grade = await prisma.courseworkGrade.findFirst({
    where: {
      studentId,
      publication: {
        academicOfferingId,
      },
      status: {
        in: [CourseworkGradeStatus.APPROVED, CourseworkGradeStatus.PUBLISHED],
      },
    },
    orderBy: [{ publishedAt: 'desc' }, { approvedAt: 'desc' }, { createdAt: 'desc' }],
  })

  if (!grade || grade.maxScore <= 0) return 0
  return clamp((grade.totalScore / grade.maxScore) * maxMarks, 0, maxMarks)
}

async function getStudentExamDerivedMarks(academicOfferingId: string, studentId: string, maxMarks: number) {
  const results = await prisma.examResult.findMany({
    where: {
      studentId,
      exam: {
        academicOfferingId,
      },
      status: {
        in: ['REVIEWED', 'PUBLISHED'],
      },
    },
    select: {
      percentage: true,
    },
  })

  if (results.length === 0) return 0
  const averagePercentage = results.reduce((sum, item) => sum + item.percentage, 0) / results.length
  return clamp((averagePercentage / 100) * maxMarks, 0, maxMarks)
}

async function getStudentAttendanceMarks(academicOfferingId: string, studentId: string, maxMarks: number) {
  const items = await prisma.examScheduleItem.findMany({
    where: {
      academicOfferingId,
    },
    select: {
      id: true,
      attendanceRecords: {
        where: {
          studentId,
        },
        select: {
          status: true,
        },
      },
    },
  })

  if (items.length === 0) return 0

  const positiveStatuses = new Set<Phase8AttendanceStatus>([
    Phase8AttendanceStatus.PRESENT,
    Phase8AttendanceStatus.LATE,
    Phase8AttendanceStatus.MEDICAL_EXCUSED,
  ])
  const attended = items.filter((item) =>
    item.attendanceRecords.some((record) => positiveStatuses.has(record.status))
  ).length

  return clamp((attended / items.length) * maxMarks, 0, maxMarks)
}

async function resolveComponentMarks(
  component: {
    id: string
    type: Phase9GradeComponentType
    maxMarks: number
    entries: Array<{
      studentId: string
      rawMarks: number
      moderatedMarks: number | null
      finalMarks: number
    }>
  },
  academicOfferingId: string,
  studentId: string
) {
  const directEntry = component.entries.find((entry) => entry.studentId === studentId)
  if (directEntry) {
    return clamp(
      directEntry.finalMarks ?? directEntry.moderatedMarks ?? directEntry.rawMarks,
      0,
      component.maxMarks
    )
  }

  if (component.type === Phase9GradeComponentType.COURSEWORK) {
    return getStudentCourseworkMarks(academicOfferingId, studentId, component.maxMarks)
  }

  if (
    component.type === Phase9GradeComponentType.FINAL ||
    component.type === Phase9GradeComponentType.MIDTERM ||
    component.type === Phase9GradeComponentType.PRACTICAL ||
    component.type === Phase9GradeComponentType.LAB ||
    component.type === Phase9GradeComponentType.VIVA
  ) {
    return getStudentExamDerivedMarks(academicOfferingId, studentId, component.maxMarks)
  }

  if (component.type === Phase9GradeComponentType.ATTENDANCE) {
    return getStudentAttendanceMarks(academicOfferingId, studentId, component.maxMarks)
  }

  return 0
}

async function recomputeStudentCumulativeMetrics(
  studentId: string,
  programId: string,
  departmentId: string,
  policy: Awaited<ReturnType<typeof ensureDefaultScaleAndPolicy>>
) {
  const records = await prisma.phase9ResultRecord.findMany({
    where: {
      studentId,
      programId,
      departmentId,
      status: {
        not: Phase9ResultLifecycleStatus.ARCHIVED,
      },
    },
    include: {
      gradebook: {
        include: {
          academicOffering: {
            include: {
              programSubject: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const bestByCourse = new Map<string, (typeof records)[number]>()
  for (const record of records) {
    const courseKey =
      record.gradebook.academicOffering.programSubjectId ??
      `${record.gradebook.academicOffering.subjectId}:${record.gradebook.academicOffering.semesterId}`
    const existing = bestByCourse.get(courseKey)
    if (!existing || record.gradePoint > existing.gradePoint || (record.gradePoint === existing.gradePoint && record.percentage > existing.percentage)) {
      bestByCourse.set(courseKey, record)
    }
  }

  let attemptedCredits = 0
  let earnedCredits = 0
  let weightedPoints = 0
  let failedCourseCount = 0

  for (const record of bestByCourse.values()) {
    const creditHours = record.gradebook.academicOffering.programSubject?.creditHours ?? record.attemptedCredits
    attemptedCredits += creditHours
    if (record.earnedCredits > 0) {
      earnedCredits += creditHours
    } else {
      failedCourseCount += 1
    }
    weightedPoints += record.gradePoint * creditHours
  }

  const cumulativeCgpa = attemptedCredits > 0 ? Number((weightedPoints / attemptedCredits).toFixed(2)) : 0
  const standing = resolveStanding(cumulativeCgpa, failedCourseCount, policy)

  await Promise.all(
    records.map((record) =>
      prisma.phase9ResultRecord.update({
        where: { id: record.id },
        data: {
          cumulativeCgpa,
          standing,
          failedCourseCount,
        },
      })
    )
  )

  return {
    cumulativeCgpa,
    standing,
    failedCourseCount,
    attemptedCredits,
    earnedCredits,
  }
}

export async function createPhase9Gradebook(input: {
  academicOfferingId: string
  departmentId: string
  academicSessionId: string
  programId: string
  semesterId: string
  groupId: string
  gradingScaleId?: string
  teacherId?: string | null
  title: string
  components: Array<{
    type: Phase9GradeComponentType
    name: string
    weight: number
    maxMarks: number
    passingMarks?: number | null
    isRequired?: boolean
    sortOrder?: number
  }>
}) {
  const defaults = await ensureDefaultScaleAndPolicy(input.departmentId)
  const gradingScaleId = input.gradingScaleId ?? defaults.gradingScaleId

  return prisma.phase9Gradebook.create({
    data: {
      academicOfferingId: input.academicOfferingId,
      departmentId: input.departmentId,
      academicSessionId: input.academicSessionId,
      programId: input.programId,
      semesterId: input.semesterId,
      groupId: input.groupId,
      gradingScaleId,
      teacherId: input.teacherId ?? null,
      title: input.title,
      components: {
        create: input.components.map((component, index) => ({
          type: component.type,
          name: component.name,
          weight: component.weight,
          maxMarks: component.maxMarks,
          passingMarks: component.passingMarks ?? null,
          isRequired: component.isRequired ?? true,
          sortOrder: component.sortOrder ?? index,
        })),
      },
    },
    include: {
      components: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
}

export async function upsertPhase9GradeEntries(
  gradebookId: string,
  entries: Array<{
    componentId: string
    studentId: string
    rawMarks: number
    moderatedMarks?: number | null
    finalMarks?: number | null
    notes?: string | null
  }>,
  actorUserId?: string | null
) {
  const gradebook = await prisma.phase9Gradebook.findUnique({
    where: { id: gradebookId },
    select: { status: true },
  })

  if (!gradebook) {
    throw new Error('Gradebook not found')
  }
  if (
    gradebook.status === Phase9ResultLifecycleStatus.PUBLISHED ||
    gradebook.status === Phase9ResultLifecycleStatus.ARCHIVED
  ) {
    throw new Error('Gradebook is locked after publication')
  }

  return Promise.all(
    entries.map((entry) =>
      prisma.phase9GradeEntry.upsert({
        where: {
          componentId_studentId: {
            componentId: entry.componentId,
            studentId: entry.studentId,
          },
        },
        create: {
          componentId: entry.componentId,
          studentId: entry.studentId,
          enteredByUserId: actorUserId ?? null,
          verifiedByUserId: null,
          rawMarks: entry.rawMarks,
          moderatedMarks: entry.moderatedMarks ?? null,
          finalMarks: entry.finalMarks ?? entry.moderatedMarks ?? entry.rawMarks,
          notes: entry.notes ?? null,
        },
        update: {
          enteredByUserId: actorUserId ?? undefined,
          rawMarks: entry.rawMarks,
          moderatedMarks: entry.moderatedMarks ?? null,
          finalMarks: entry.finalMarks ?? entry.moderatedMarks ?? entry.rawMarks,
          notes: entry.notes ?? null,
        },
      })
    )
  )
}

export async function calculatePhase9Gradebook(gradebookId: string, actor?: Phase9Actor) {
  const gradebook = await prisma.phase9Gradebook.findUnique({
    where: { id: gradebookId },
    include: {
      academicOffering: {
        include: {
          programSubject: true,
        },
      },
      components: {
        include: {
          entries: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  if (!gradebook) {
    throw new Error('Gradebook not found')
  }

  const policy = await ensureDefaultScaleAndPolicy(gradebook.departmentId)
  const bands = policy.gradingScale.bands as unknown as GradeBand[]
  const students = await prisma.studentProfile.findMany({
    where: {
      subjects: {
        some: {
          academicOfferingId: gradebook.academicOfferingId,
        },
      },
    },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const attemptedCredits = gradebook.academicOffering.programSubject?.creditHours ?? 0
  const totalMarks = gradebook.components.reduce((sum, component) => sum + component.maxMarks, 0)
  const totalWeight = gradebook.components.reduce((sum, component) => sum + component.weight, 0)

  const results = []
  for (const student of students) {
    let marksObtained = 0
    let weightedScore = 0

    for (const component of gradebook.components) {
      const marks = await resolveComponentMarks(component, gradebook.academicOfferingId, student.id)
      marksObtained += marks
      weightedScore += component.maxMarks > 0 ? (marks / component.maxMarks) * component.weight : 0
    }

    const percentage = totalWeight > 0 ? Number(((weightedScore / totalWeight) * 100).toFixed(2)) : 0
    const band = resolveBand(percentage, bands)
    const earnedCredits = band.isPassing ? attemptedCredits : 0
    const semesterGpa = attemptedCredits > 0 ? Number(((band.gradePoint * attemptedCredits) / attemptedCredits).toFixed(2)) : 0

    const record = await prisma.phase9ResultRecord.upsert({
      where: {
        gradebookId_studentId: {
          gradebookId,
          studentId: student.id,
        },
      },
      create: {
        gradebookId,
        studentId: student.id,
        departmentId: gradebook.departmentId,
        academicSessionId: gradebook.academicSessionId,
        programId: gradebook.programId,
        semesterId: gradebook.semesterId,
        groupId: gradebook.groupId,
        attemptedCredits,
        earnedCredits,
        totalMarks,
        marksObtained: Number(marksObtained.toFixed(2)),
        percentage,
        letterGrade: band.label,
        gradePoint: band.gradePoint,
        semesterGpa,
        cumulativeCgpa: semesterGpa,
        failedCourseCount: band.isPassing ? 0 : 1,
        standing: resolveStanding(semesterGpa, band.isPassing ? 0 : 1, policy),
        status: Phase9ResultLifecycleStatus.CALCULATED,
        metadata: {
          studentName: student.user.name,
          studentEmail: student.user.email,
        },
      },
      update: {
        attemptedCredits,
        earnedCredits,
        totalMarks,
        marksObtained: Number(marksObtained.toFixed(2)),
        percentage,
        letterGrade: band.label,
        gradePoint: band.gradePoint,
        semesterGpa,
        standing: resolveStanding(semesterGpa, band.isPassing ? 0 : 1, policy),
        failedCourseCount: band.isPassing ? 0 : 1,
        status: Phase9ResultLifecycleStatus.CALCULATED,
        metadata: {
          studentName: student.user.name,
          studentEmail: student.user.email,
        },
      },
    })

    await prisma.phase9ResultTransition.create({
      data: {
        resultRecordId: record.id,
        actorUserId: actor?.userId ?? student.userId,
        fromStatus: record.status === Phase9ResultLifecycleStatus.CALCULATED ? Phase9ResultLifecycleStatus.DRAFT : record.status,
        toStatus: Phase9ResultLifecycleStatus.CALCULATED,
        notes: actor?.notes ?? 'Calculated from gradebook components',
      },
    })

    results.push(record)
  }

  await prisma.phase9Gradebook.update({
    where: { id: gradebookId },
    data: {
      status: Phase9ResultLifecycleStatus.CALCULATED,
    },
  })

  for (const student of students) {
    await recomputeStudentCumulativeMetrics(student.id, gradebook.programId, gradebook.departmentId, policy)
  }

  return {
    gradebookId,
    calculatedCount: results.length,
  }
}

export async function transitionPhase9ResultRecord(
  resultRecordId: string,
  nextStatus: Phase9ResultLifecycleStatus,
  actor: Phase9Actor
) {
  const record = await prisma.phase9ResultRecord.findUnique({
    where: { id: resultRecordId },
    include: {
      student: {
        include: {
          user: true,
        },
      },
      gradebook: true,
    },
  })

  if (!record) {
    throw new Error('Result record not found')
  }

  const allowed = RESULT_TRANSITIONS[record.status]
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Invalid result transition from ${record.status} to ${nextStatus}`)
  }

  const now = new Date()
  const updated = await prisma.phase9ResultRecord.update({
    where: { id: resultRecordId },
    data: {
      status: nextStatus,
      publishedAt: nextStatus === Phase9ResultLifecycleStatus.PUBLISHED ? now : undefined,
      lockedAt:
        nextStatus === Phase9ResultLifecycleStatus.PUBLISHED || nextStatus === Phase9ResultLifecycleStatus.ARCHIVED
          ? now
          : undefined,
    },
  })

  await prisma.phase9ResultTransition.create({
    data: {
      resultRecordId,
      actorUserId: actor.userId ?? record.student.userId,
      fromStatus: record.status,
      toStatus: nextStatus,
      notes: actor.notes ?? null,
    },
  })

  if (record.gradebook.status !== nextStatus) {
    await prisma.phase9Gradebook.update({
      where: { id: record.gradebookId },
      data: {
        status: nextStatus,
        publishedAt: nextStatus === Phase9ResultLifecycleStatus.PUBLISHED ? now : undefined,
        lockedAt:
          nextStatus === Phase9ResultLifecycleStatus.PUBLISHED || nextStatus === Phase9ResultLifecycleStatus.ARCHIVED
            ? now
            : undefined,
      },
    })
  }

  if (nextStatus === Phase9ResultLifecycleStatus.PUBLISHED) {
    const exists = await prisma.notification.findFirst({
      where: {
        userId: record.student.userId,
        title: 'Phase 9 Result Published',
        link: `/student/results-enterprise?record=${record.id}`,
      },
      select: { id: true },
    })

    if (!exists) {
      await prisma.notification.create({
        data: {
          userId: record.student.userId,
          title: 'Phase 9 Result Published',
          message: `Your published result is available with ${record.letterGrade ?? 'N/A'} (${record.percentage.toFixed(2)}%).`,
          type: 'success',
          link: `/student/results-enterprise?record=${record.id}`,
        },
      })
    }
  }

  return updated
}

export async function generatePhase9Transcript(
  studentId: string,
  locale: string,
  generatedByUserId?: string | null
) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      user: true,
      department: true,
      enrollments: {
        where: {
          OR: [
            { status: 'ACTIVE', isActive: true },
            { status: 'GRADUATED' },
            { status: 'ALUMNI' },
          ],
        },
        include: {
          program: true,
          academicSession: true,
        },
        orderBy: [{ isActive: 'desc' }, { enrolledAt: 'desc' }],
        take: 1,
      },
    },
  })

  if (!student) {
    throw new Error('Student not found')
  }

  const records = await prisma.phase9ResultRecord.findMany({
    where: {
      studentId,
      status: {
        in: [Phase9ResultLifecycleStatus.APPROVED, Phase9ResultLifecycleStatus.PUBLISHED, Phase9ResultLifecycleStatus.ARCHIVED],
      },
    },
    include: {
      semester: true,
      gradebook: {
        include: {
          academicOffering: {
            include: {
              subject: true,
              programSubject: true,
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }],
  })

  const latestRecord = records[records.length - 1] ?? null
  const verificationCode = phase9Code('TRX')
  const lines = [
    'ExamFlow Pro University',
    locale === 'bn' ? 'সরকারি ট্রান্সক্রিপ্ট' : 'Official Transcript',
    `Verification Code: ${verificationCode}`,
    `Student: ${student.user.name}`,
    `Student ID: ${student.id}`,
    `Department: ${student.department.name}`,
    `Program: ${student.enrollments[0]?.program.name ?? 'Unknown Program'}`,
    `Academic Session: ${student.enrollments[0]?.academicSession.name ?? 'Unknown Session'}`,
    `Current CGPA: ${latestRecord?.cumulativeCgpa?.toFixed(2) ?? '0.00'}`,
    `Standing: ${latestRecord?.standing ?? Phase9AcademicStandingStatus.GOOD_STANDING}`,
    'Courses:',
    ...records.map((record) =>
      `${record.semester.name}: ${record.gradebook.academicOffering.subject.name} | Credits ${record.attemptedCredits.toFixed(2)} | Grade ${record.letterGrade ?? 'N/A'} | GPA ${record.semesterGpa.toFixed(2)}`
    ),
  ]

  const buffer = buildSimplePdf(lines)
  const filePath = await persistPrivatePdf(`phase-9/transcripts/${verificationCode}.pdf`, buffer)
  const transcript = await prisma.phase9TranscriptRecord.create({
    data: {
      studentId,
      departmentId: student.departmentId,
      locale,
      verificationCode,
      qrCode: verificationCode,
      barcode: verificationCode,
      filePath,
      generatedByUserId: generatedByUserId ?? null,
    },
  })

  return {
    transcript,
    buffer,
    filePath,
  }
}

export async function generatePhase9Marksheet(
  studentId: string,
  type: Phase9MarksheetType,
  locale: string,
  generatedByUserId?: string | null
) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      user: true,
      department: true,
    },
  })

  if (!student) {
    throw new Error('Student not found')
  }

  const records = await prisma.phase9ResultRecord.findMany({
    where: {
      studentId,
      status: {
        in: [Phase9ResultLifecycleStatus.APPROVED, Phase9ResultLifecycleStatus.PUBLISHED, Phase9ResultLifecycleStatus.ARCHIVED],
      },
    },
    include: {
      semester: true,
      gradebook: {
        include: {
          academicOffering: {
            include: {
              subject: true,
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }],
  })

  const verificationCode = phase9Code('MRK')
  const buffer = buildSimplePdf([
    'ExamFlow Pro University',
    `${type} Marksheet`,
    `Verification Code: ${verificationCode}`,
    `Student: ${student.user.name}`,
    ...records.map((record) => `${record.semester.name}: ${record.gradebook.academicOffering.subject.name} ${record.marksObtained.toFixed(2)}/${record.totalMarks.toFixed(2)} (${record.letterGrade ?? 'N/A'})`),
  ])
  const filePath = await persistPrivatePdf(`phase-9/marksheets/${verificationCode}.pdf`, buffer)
  const marksheet = await prisma.phase9MarksheetRecord.create({
    data: {
      studentId,
      departmentId: student.departmentId,
      locale,
      type,
      verificationCode,
      qrCode: verificationCode,
      barcode: verificationCode,
      filePath,
      generatedByUserId: generatedByUserId ?? null,
    },
  })

  return {
    marksheet,
    buffer,
    filePath,
  }
}

export async function generatePhase9Certificate(
  studentId: string,
  type: Phase9CertificateType,
  locale: string,
  issuedByUserId?: string | null,
  graduationId?: string | null,
  reissuedFromId?: string | null
) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      user: true,
      department: true,
      enrollments: {
        include: {
          program: true,
        },
        orderBy: [{ isActive: 'desc' }, { enrolledAt: 'desc' }],
        take: 1,
      },
    },
  })

  if (!student) {
    throw new Error('Student not found')
  }

  const graduation =
    graduationId
      ? await prisma.studentGraduation.findUnique({ where: { id: graduationId } })
      : await prisma.studentGraduation.findFirst({
          where: { studentId },
          orderBy: { graduatedAt: 'desc' },
        })

  const certificateNumber = phase9Code('CERT')
  const verificationCode = phase9Code('VC')
  const buffer = buildSimplePdf([
    'ExamFlow Pro University',
    `${type} Certificate`,
    `Verification Code: ${verificationCode}`,
    `Certificate Number: ${certificateNumber}`,
    `Student: ${student.user.name}`,
    `Department: ${student.department.name}`,
    `Program: ${student.enrollments[0]?.program.name ?? 'Unknown Program'}`,
    `Graduation Reference: ${graduation?.id ?? 'N/A'}`,
    locale === 'bn' ? 'এই সনদ যাচাইকরণ কোডের মাধ্যমে যাচাইযোগ্য।' : 'This certificate can be verified using the verification code.',
  ])

  const filePath = await persistPrivatePdf(`phase-9/certificates/${verificationCode}.pdf`, buffer)
  const certificate = await prisma.phase9CertificateRecord.create({
    data: {
      studentId,
      departmentId: student.departmentId,
      graduationId: graduation?.id ?? null,
      type,
      certificateNumber,
      verificationCode,
      qrCode: verificationCode,
      barcode: verificationCode,
      filePath,
      reissuedFromId: reissuedFromId ?? null,
      issuedByUserId: issuedByUserId ?? null,
    },
  })

  return {
    certificate,
    buffer,
    filePath,
  }
}

export async function buildPhase9DegreeAudit(studentId: string) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      enrollments: {
        where: {
          OR: [
            { status: 'ACTIVE', isActive: true },
            { status: 'GRADUATED' },
            { status: 'ALUMNI' },
          ],
        },
        include: {
          program: true,
        },
        orderBy: [{ isActive: 'desc' }, { enrolledAt: 'desc' }],
        take: 1,
      },
    },
  })

  if (!student || student.enrollments.length === 0) {
    throw new Error('Student enrollment not found')
  }

  const enrollment = student.enrollments[0]
  const policy = await ensureDefaultScaleAndPolicy(enrollment.departmentId)
  const requiredSubjects = await prisma.programSubject.findMany({
    where: {
      programId: enrollment.programId,
      isActive: true,
    },
    orderBy: [{ sortOrder: 'asc' }],
  })

  const resultRecords = await prisma.phase9ResultRecord.findMany({
    where: {
      studentId,
      programId: enrollment.programId,
      status: {
        in: [Phase9ResultLifecycleStatus.APPROVED, Phase9ResultLifecycleStatus.PUBLISHED, Phase9ResultLifecycleStatus.ARCHIVED],
      },
    },
    include: {
      gradebook: {
        include: {
          academicOffering: true,
        },
      },
    },
  })

  const passedCourseKeys = new Set(
    resultRecords
      .filter((record) => record.earnedCredits > 0)
      .map((record) => record.gradebook.academicOffering.programSubjectId ?? record.gradebook.academicOffering.subjectId)
  )
  const requiredCredits = requiredSubjects.reduce((sum, subject) => sum + (subject.creditHours ?? 0), 0)
  const completedCredits = requiredSubjects
    .filter((subject) => passedCourseKeys.has(subject.id) || passedCourseKeys.has(subject.subjectId))
    .reduce((sum, subject) => sum + (subject.creditHours ?? 0), 0)
  const compulsoryOutstanding = requiredSubjects
    .filter((subject) => subject.isRequired && !passedCourseKeys.has(subject.id) && !passedCourseKeys.has(subject.subjectId))
    .map((subject) => subject.id)
  const electiveOutstanding = requiredSubjects
    .filter((subject) => subject.isElective && !passedCourseKeys.has(subject.id) && !passedCourseKeys.has(subject.subjectId))
    .map((subject) => subject.id)
  const latestCgpa = resultRecords.reduce((max, record) => Math.max(max, record.cumulativeCgpa), 0)
  const isEligible =
    completedCredits >= Math.max(policy.graduationMinimumCredits, requiredCredits) &&
    compulsoryOutstanding.length === 0 &&
    latestCgpa >= policy.graduationMinCgpa

  return prisma.phase9DegreeAudit.create({
    data: {
      studentId,
      departmentId: enrollment.departmentId,
      programId: enrollment.programId,
      requiredCredits,
      completedCredits,
      remainingCredits: Math.max(requiredCredits - completedCredits, 0),
      requiredGpa: policy.graduationMinCgpa,
      currentCgpa: latestCgpa,
      compulsoryOutstanding,
      electiveOutstanding,
      requirementSummary: {
        requiredCredits,
        completedCredits,
        currentCgpa: latestCgpa,
      },
      isEligible,
    },
  })
}

export async function createOrRefreshPhase9GraduationCandidate(studentId: string) {
  const audit = await buildPhase9DegreeAudit(studentId)
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      enrollments: {
        where: {
          status: 'ACTIVE',
          isActive: true,
        },
        orderBy: { enrolledAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!student) {
    throw new Error('Student not found')
  }

  const enrollmentId = student.enrollments[0]?.id ?? null
  const candidate = await prisma.phase9GraduationCandidate.create({
    data: {
      studentId,
      departmentId: audit.departmentId,
      enrollmentId,
      degreeAuditId: audit.id,
      status: audit.isEligible ? Phase9GraduationWorkflowStatus.ELIGIBLE : Phase9GraduationWorkflowStatus.PENDING,
    },
  })

  return {
    candidate,
    audit,
  }
}

export async function transitionPhase9GraduationCandidate(
  candidateId: string,
  nextStatus: Phase9GraduationWorkflowStatus,
  actorUserId?: string | null,
  notes?: string | null
) {
  const candidate = await prisma.phase9GraduationCandidate.findUnique({
    where: { id: candidateId },
    include: {
      student: true,
      degreeAudit: true,
      enrollment: {
        include: {
          program: true,
        },
      },
    },
  })

  if (!candidate) {
    throw new Error('Graduation candidate not found')
  }

  const allowed = GRADUATION_TRANSITIONS[candidate.status]
  if (!allowed.includes(nextStatus)) {
    throw new Error(`Invalid graduation transition from ${candidate.status} to ${nextStatus}`)
  }

  let graduationId = candidate.graduationId
  if (nextStatus === Phase9GraduationWorkflowStatus.CERTIFIED && !graduationId) {
    if (!candidate.enrollment || !candidate.degreeAudit) {
      throw new Error('Graduation certification requires enrollment and degree audit')
    }

    const graduationPayload = {
      graduatedAt: new Date(),
      finalCgpa: candidate.degreeAudit.currentCgpa,
      degreeClassification: candidate.degreeAudit.currentCgpa >= 3.75 ? 'Honours' : null,
      certificateNumber: phase9Code('GRAD'),
      degreeAwarded: candidate.enrollment.program.name,
      alumniAt: new Date(),
      notes: notes ?? 'Phase 9 graduation certification',
    }

    try {
      const graduationResult = await graduateStudent(
        candidate.studentId,
        graduationPayload,
        actorUserId
          ? {
              actorUserId,
              actorRole: UserRole.DEPARTMENT_ADMIN,
              sourceApi: 'phase9',
            }
          : undefined
      )
      graduationId = graduationResult.graduation.id
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const canFallback =
        candidate.degreeAudit.isEligible &&
        candidate.enrollmentId &&
        (
          message.includes('program semester context') ||
          message.includes('before the final semester') ||
          message.includes('Graduation record already exists')
        )

      if (!canFallback) {
        throw error
      }

      if (message.includes('Graduation record already exists')) {
        const existingGraduation = await prisma.studentGraduation.findFirst({
          where: { studentId: candidate.studentId },
          orderBy: { graduatedAt: 'desc' },
        })
        if (!existingGraduation) {
          throw error
        }
        graduationId = existingGraduation.id
      } else {
        const fallbackGraduation = await prisma.studentGraduation.create({
          data: {
            studentId: candidate.studentId,
            enrollmentId: candidate.enrollmentId!,
            graduatedAt: graduationPayload.graduatedAt,
            finalCgpa: graduationPayload.finalCgpa,
            degreeClassification: graduationPayload.degreeClassification,
            certificateNumber: graduationPayload.certificateNumber,
            degreeAwarded: graduationPayload.degreeAwarded,
            alumniAt: graduationPayload.alumniAt,
            notes: `${graduationPayload.notes} (Phase 9 fallback graduation path)`,
          },
        })

        await prisma.studentEnrollment.update({
          where: { id: candidate.enrollmentId! },
          data: {
            status: 'GRADUATED',
            isActive: false,
            graduationDate: graduationPayload.graduatedAt,
            endedAt: graduationPayload.graduatedAt,
            notes: notes ?? 'Graduated through Phase 9 certification fallback',
          },
        })

        graduationId = fallbackGraduation.id
      }
    }
  }

  return prisma.phase9GraduationCandidate.update({
    where: { id: candidateId },
    data: {
      status: nextStatus,
      graduationId: graduationId ?? undefined,
      approvedByUserId:
        nextStatus === Phase9GraduationWorkflowStatus.APPROVED ? actorUserId ?? undefined : undefined,
      certifiedByUserId:
        nextStatus === Phase9GraduationWorkflowStatus.CERTIFIED ? actorUserId ?? undefined : undefined,
      approvedAt: nextStatus === Phase9GraduationWorkflowStatus.APPROVED ? new Date() : undefined,
      certifiedAt: nextStatus === Phase9GraduationWorkflowStatus.CERTIFIED ? new Date() : undefined,
      notes: notes ?? undefined,
    },
  })
}

export async function createPhase9Appeal(input: {
  resultRecordId: string
  studentId: string
  departmentId: string
  teacherId?: string | null
  reason: string
}) {
  return prisma.phase9ResultAppeal.create({
    data: {
      resultRecordId: input.resultRecordId,
      studentId: input.studentId,
      departmentId: input.departmentId,
      teacherId: input.teacherId ?? null,
      reason: input.reason,
      auditTrail: [
        {
          status: Phase9AppealStatus.SUBMITTED,
          timestamp: new Date().toISOString(),
          reason: input.reason,
        },
      ],
    },
  })
}

export async function updatePhase9Appeal(
  appealId: string,
  input: {
    status: Phase9AppealStatus
    teacherResponse?: string | null
    adminDecision?: string | null
    reviewedByUserId?: string | null
  }
) {
  const appeal = await prisma.phase9ResultAppeal.findUnique({
    where: { id: appealId },
  })

  if (!appeal) {
    throw new Error('Appeal not found')
  }

  const previousTrail = Array.isArray(appeal.auditTrail) ? appeal.auditTrail : []
  return prisma.phase9ResultAppeal.update({
    where: { id: appealId },
    data: {
      status: input.status,
      teacherResponse: input.teacherResponse ?? null,
      adminDecision: input.adminDecision ?? null,
      reviewedByUserId: input.reviewedByUserId ?? null,
      reviewedAt: new Date(),
      resolvedAt:
        input.status === Phase9AppealStatus.RESOLVED ||
        input.status === Phase9AppealStatus.ACCEPTED ||
        input.status === Phase9AppealStatus.REJECTED
          ? new Date()
          : null,
      auditTrail: [
        ...previousTrail,
        {
          status: input.status,
          timestamp: new Date().toISOString(),
          teacherResponse: input.teacherResponse ?? null,
          adminDecision: input.adminDecision ?? null,
        },
      ],
    },
  })
}

export async function verifyPhase9Document(code: string) {
  const [transcript, marksheet, certificate] = await Promise.all([
    prisma.phase9TranscriptRecord.findUnique({
      where: { verificationCode: code },
      include: {
        student: { include: { user: true } },
      },
    }),
    prisma.phase9MarksheetRecord.findUnique({
      where: { verificationCode: code },
      include: {
        student: { include: { user: true } },
      },
    }),
    prisma.phase9CertificateRecord.findUnique({
      where: { verificationCode: code },
      include: {
        student: { include: { user: true } },
      },
    }),
  ])

  if (transcript) {
    return {
      type: 'transcript',
      valid: transcript.status !== Phase9DocumentStatus.REVOKED,
      holder: transcript.student.user.name,
      generatedAt: transcript.generatedAt,
    }
  }

  if (marksheet) {
    return {
      type: 'marksheet',
      valid: marksheet.status !== Phase9DocumentStatus.REVOKED,
      holder: marksheet.student.user.name,
      generatedAt: marksheet.generatedAt,
    }
  }

  if (certificate) {
    return {
      type: 'certificate',
      valid: certificate.status !== Phase9DocumentStatus.REVOKED,
      holder: certificate.student.user.name,
      generatedAt: certificate.issuedAt,
    }
  }

  return null
}

export async function buildPhase9Analytics(input: {
  departmentId: string
}) {
  const records = await prisma.phase9ResultRecord.findMany({
    where: {
      departmentId: input.departmentId,
      status: {
        in: [Phase9ResultLifecycleStatus.APPROVED, Phase9ResultLifecycleStatus.PUBLISHED, Phase9ResultLifecycleStatus.ARCHIVED],
      },
    },
    include: {
      student: {
        include: {
          user: true,
        },
      },
      gradebook: {
        include: {
          academicOffering: {
            include: {
              subject: true,
            },
          },
        },
      },
    },
  })

  const total = records.length
  const passed = records.filter((record) => record.earnedCredits > 0).length
  const failed = total - passed
  const averageCgpa = total > 0 ? Number((records.reduce((sum, record) => sum + record.cumulativeCgpa, 0) / total).toFixed(2)) : 0
  const averageGpa = total > 0 ? Number((records.reduce((sum, record) => sum + record.semesterGpa, 0) / total).toFixed(2)) : 0
  const standingSummary = Object.values(Phase9AcademicStandingStatus).reduce<Record<string, number>>((summary, status) => {
    summary[status] = records.filter((record) => record.standing === status).length
    return summary
  }, {})
  const rankedStudents = [...records]
    .sort((left, right) => right.cumulativeCgpa - left.cumulativeCgpa || right.percentage - left.percentage)
    .slice(0, 10)
    .map((record, index) => ({
      rank: index + 1,
      studentName: record.student.user.name,
      subject: record.gradebook.academicOffering.subject.name,
      cgpa: record.cumulativeCgpa,
      gpa: record.semesterGpa,
    }))

  return {
    totals: {
      total,
      passed,
      failed,
      passRate: total > 0 ? Number(((passed / total) * 100).toFixed(2)) : 0,
      failureRate: total > 0 ? Number(((failed / total) * 100).toFixed(2)) : 0,
      averageCgpa,
      averageGpa,
    },
    standingSummary,
    rankedStudents,
    csv: buildCsv(
      ['Student', 'Subject', 'Semester GPA', 'CGPA', 'Standing'],
      records.map((record) => [
        record.student.user.name,
        record.gradebook.academicOffering.subject.name,
        record.semesterGpa,
        record.cumulativeCgpa,
        record.standing,
      ])
    ),
    pdf: buildSimplePdf([
      'Phase 9 Analytics Summary',
      `Total Results: ${total}`,
      `Pass Rate: ${total > 0 ? ((passed / total) * 100).toFixed(2) : '0.00'}%`,
      `Failure Rate: ${total > 0 ? ((failed / total) * 100).toFixed(2) : '0.00'}%`,
      `Average GPA: ${averageGpa.toFixed(2)}`,
      `Average CGPA: ${averageCgpa.toFixed(2)}`,
      ...rankedStudents.map((item) => `${item.rank}. ${item.studentName} | CGPA ${item.cgpa.toFixed(2)} | GPA ${item.gpa.toFixed(2)}`),
    ]),
  }
}
