import {
  ExamStatus,
  Prisma,
  ResultStatus,
  StudentAcademicHistoryEventType,
  StudentEnrollmentStatus,
  StudentLeaveType,
  StudentPromotionStatus,
  StudentTransferType,
  UserRole,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'

type Tx = Prisma.TransactionClient
const LIFECYCLE_TX_OPTIONS = { maxWait: 5_000, timeout: 20_000 } as const

const openLeaveFilter: Prisma.StudentLeaveWhereInput = {
  OR: [
    { readmittedAt: null },
    { readmittedAt: { isSet: false } },
  ],
}

type LifecycleActor = {
  actorUserId?: string | null
  actorRole?: UserRole | null
  sourceApi?: string | null
}

type EnrollmentContextInput = {
  departmentId: string
  academicSessionId: string
  programId: string
  programYearId: string
  semesterId: string
  programSemesterId?: string | null
  groupId: string
  academicYearId?: string | null
  departmentLanguageId?: string | null
  languageId?: string | null
}

type EnrollmentContextResolved = EnrollmentContextInput & {
  department: { id: string; name: string }
  academicSession: { id: string; name: string; isActive: boolean }
  program: { id: string; name: string; departmentId: string; durationYears: number; totalSemesters: number; isActive: boolean }
  programYear: { id: string; yearNumber: number; programId: string; name: string; isActive: boolean }
  semester: { id: string; number: number; name: string; isActive: boolean }
  programSemester: { id: string; semesterNumber: number; programId: string; programYearId: string; semesterId: string; isActive: boolean } | null
  group: {
    id: string
    name: string
    departmentId: string | null
    programId: string | null
    academicSessionId: string | null
    programYearId: string | null
    currentProgramSemesterId: string | null
    academicYearId: string | null
    languageId: string | null
    departmentLanguageId: string | null
    isActive: boolean
  }
}

async function getStudentOrThrow(studentId: string, tx: Tx = prisma) {
  const student = await tx.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { id: true, name: true, isActive: true } },
      department: { select: { id: true, name: true } },
    },
  })

  if (!student) {
    throw new Error('Student not found')
  }

  return student
}

export async function getActiveEnrollment(studentId: string, tx: Tx = prisma) {
  return tx.studentEnrollment.findFirst({
    where: {
      studentId,
      status: StudentEnrollmentStatus.ACTIVE,
      isActive: true,
    },
    include: {
      program: true,
      programYear: true,
      semester: true,
      programSemester: true,
      academicSession: true,
      group: true,
      academicYear: true,
      department: true,
      departmentLanguage: true,
      language: true,
      student: {
        include: {
          user: { select: { id: true, name: true, email: true, isActive: true } },
        },
      },
    },
    orderBy: { enrolledAt: 'desc' },
  })
}

async function resolveEnrollmentContext(input: EnrollmentContextInput, tx: Tx): Promise<EnrollmentContextResolved> {
  const [
    department,
    academicSession,
    program,
    programYear,
    semester,
    programSemester,
    group,
    academicYear,
    departmentLanguage,
    language,
  ] = await Promise.all([
    tx.department.findUnique({ where: { id: input.departmentId }, select: { id: true, name: true } }),
    tx.academicSession.findUnique({ where: { id: input.academicSessionId }, select: { id: true, name: true, isActive: true } }),
    tx.academicProgram.findUnique({
      where: { id: input.programId },
      select: { id: true, name: true, departmentId: true, durationYears: true, totalSemesters: true, isActive: true },
    }),
    tx.programYear.findUnique({
      where: { id: input.programYearId },
      select: { id: true, yearNumber: true, programId: true, name: true, isActive: true },
    }),
    tx.semester.findUnique({ where: { id: input.semesterId }, select: { id: true, number: true, name: true, isActive: true } }),
    input.programSemesterId
      ? tx.programSemester.findUnique({
          where: { id: input.programSemesterId },
          select: { id: true, semesterNumber: true, programId: true, programYearId: true, semesterId: true, isActive: true },
        })
      : Promise.resolve(null),
    tx.group.findUnique({
      where: { id: input.groupId },
      select: {
        id: true,
        name: true,
        departmentId: true,
        programId: true,
        academicSessionId: true,
        programYearId: true,
        currentProgramSemesterId: true,
        academicYearId: true,
        languageId: true,
        departmentLanguageId: true,
        isActive: true,
      },
    }),
    input.academicYearId
      ? tx.academicYear.findUnique({ where: { id: input.academicYearId }, select: { id: true } })
      : Promise.resolve(null),
    input.departmentLanguageId
      ? tx.departmentLanguage.findUnique({ where: { id: input.departmentLanguageId }, select: { id: true, departmentId: true, languageId: true, isActive: true } })
      : Promise.resolve(null),
    input.languageId
      ? tx.language.findUnique({ where: { id: input.languageId }, select: { id: true } })
      : Promise.resolve(null),
  ])

  if (!department) throw new Error('Department not found')
  if (!academicSession) throw new Error('Academic session not found')
  if (!academicSession.isActive) throw new Error('Academic session is inactive')
  if (!program) throw new Error('Program not found')
  if (!program.isActive) throw new Error('Program is inactive')
  if (!programYear || programYear.programId !== program.id) {
    throw new Error('Program year does not belong to the selected program')
  }
  if (!programYear.isActive) {
    throw new Error('Program year is inactive')
  }
  if (!semester) throw new Error('Semester not found')
  if (!semester.isActive) throw new Error('Semester is inactive')
  if (program.departmentId !== department.id) {
    throw new Error('Program does not belong to the selected department')
  }
  if (!group) throw new Error('Group not found')
  if (!group.isActive) throw new Error('Group is inactive')
  if (group.departmentId && group.departmentId !== department.id) {
    throw new Error('Group does not belong to the selected department')
  }
  if (group.programId && group.programId !== program.id) {
    throw new Error('Group does not belong to the selected program')
  }
  if (group.academicSessionId && group.academicSessionId !== academicSession.id) {
    throw new Error('Group does not belong to the selected academic session')
  }
  if (group.programYearId && group.programYearId !== programYear.id) {
    throw new Error('Group does not belong to the selected program year')
  }
  if (input.academicYearId && !academicYear) {
    throw new Error('Academic year not found')
  }
  if (academicYear && group.academicYearId && group.academicYearId !== academicYear.id) {
    throw new Error('Group does not belong to the selected academic year')
  }
  if (programSemester) {
    if (!programSemester.isActive) {
      throw new Error('Program semester is inactive')
    }
    if (programSemester.programId !== program.id) {
      throw new Error('Program semester does not belong to the selected program')
    }
    if (programSemester.programYearId !== programYear.id) {
      throw new Error('Program semester does not belong to the selected program year')
    }
    if (programSemester.semesterId !== semester.id) {
      throw new Error('Program semester does not belong to the selected semester')
    }
  }
  if (departmentLanguage && departmentLanguage.departmentId !== department.id) {
    throw new Error('Department language does not belong to the selected department')
  }
  if (departmentLanguage && !departmentLanguage.isActive) {
    throw new Error('Department language is inactive')
  }
  if (departmentLanguage && input.languageId && departmentLanguage.languageId !== input.languageId) {
    throw new Error('Department language does not match the selected language')
  }
  if (input.languageId && !language) {
    throw new Error('Language not found')
  }
  if (input.languageId && group.languageId && group.languageId !== input.languageId) {
    throw new Error('Group does not belong to the selected language')
  }
  if (departmentLanguage && group.departmentLanguageId && group.departmentLanguageId !== departmentLanguage.id) {
    throw new Error('Group does not belong to the selected department language')
  }

  return {
    ...input,
    department,
    academicSession,
    program,
    programYear,
    semester,
    programSemester,
    group,
  }
}

async function syncLegacySubjectsForEnrollment(studentId: string, context: EnrollmentContextResolved, tx: Tx) {
  const offerings = await tx.academicOffering.findMany({
    where: {
      academicSessionId: context.academicSessionId,
      programId: context.programId,
      programYearId: context.programYearId,
      semesterId: context.semesterId,
      groupId: context.groupId,
      isActive: true,
    },
    select: {
      id: true,
      subjectId: true,
      languageId: true,
      groupId: true,
      semesterId: true,
    },
  })

  if (offerings.length === 0) {
    return { created: 0, skipped: 0 }
  }

  const academicYearId = context.academicYearId ?? context.group.academicYearId
  if (!academicYearId) {
    return { created: 0, skipped: offerings.length }
  }

  let created = 0
  let skipped = 0
  for (const offering of offerings) {
    const existing = await tx.studentSubject.findFirst({
      where: {
        studentId,
        academicOfferingId: offering.id,
      },
      select: { id: true },
    })

    if (existing) {
      skipped += 1
      continue
    }

    await tx.studentSubject.create({
      data: {
        studentId,
        subjectId: offering.subjectId,
        languageId: offering.languageId,
        groupId: offering.groupId,
        academicYearId,
        semesterId: offering.semesterId,
        academicOfferingId: offering.id,
      },
    })
    created += 1
  }

  return { created, skipped, offeringIds: offerings.map((offering) => offering.id) }
}

async function createHistoryEntry(
  data: Prisma.StudentAcademicHistoryUncheckedCreateInput,
  tx: Tx
) {
  return tx.studentAcademicHistory.create({ data })
}

async function createLifecycleAuditLog(
  tx: Tx,
  input: {
    actor?: LifecycleActor
    studentUserId?: string | null
    action: string
    details: Record<string, unknown>
  }
) {
  if (!input.actor?.actorUserId) return null

  return tx.activityLog.create({
    data: {
      userId: input.actor.actorUserId,
      action: input.action,
      details: JSON.stringify({
        actorRole: input.actor.actorRole ?? null,
        sourceApi: input.actor.sourceApi ?? null,
        studentUserId: input.studentUserId ?? null,
        ...input.details,
      }),
    },
  })
}

function buildHistorySnapshot(
  enrollment: {
    id: string
    departmentId: string
    academicYearId?: string | null
    academicSessionId: string
    programId: string
    programYearId: string
    semesterId: string
    programSemesterId?: string | null
    groupId: string
    status: StudentEnrollmentStatus
  } | null
) {
  if (!enrollment) return {}

  return {
    enrollmentId: enrollment.id,
    fromDepartmentId: enrollment.departmentId,
    fromAcademicYearId: enrollment.academicYearId ?? null,
    fromAcademicSessionId: enrollment.academicSessionId,
    fromProgramId: enrollment.programId,
    fromProgramYearId: enrollment.programYearId,
    fromSemesterId: enrollment.semesterId,
    fromProgramSemesterId: enrollment.programSemesterId ?? null,
    fromGroupId: enrollment.groupId,
    fromStatus: enrollment.status,
  }
}

function buildTargetHistorySnapshot(context: EnrollmentContextResolved, status: StudentEnrollmentStatus) {
  return {
    toDepartmentId: context.departmentId,
    toAcademicYearId: context.academicYearId ?? null,
    toAcademicSessionId: context.academicSessionId,
    toProgramId: context.programId,
    toProgramYearId: context.programYearId,
    toSemesterId: context.semesterId,
    toProgramSemesterId: context.programSemesterId ?? null,
    toGroupId: context.groupId,
    toStatus: status,
  }
}

async function closeEnrollment(
  enrollmentId: string,
  status: StudentEnrollmentStatus,
  endedAt: Date,
  tx: Tx
) {
  return tx.studentEnrollment.update({
    where: { id: enrollmentId },
    data: {
      status,
      endedAt,
      isActive: false,
    },
  })
}

function getEnrollmentContextForAudit(enrollment: {
  departmentId: string
  academicSessionId: string
  programId: string
  programYearId: string
  semesterId: string
  programSemesterId?: string | null
  groupId: string
  academicYearId?: string | null
  departmentLanguageId?: string | null
  languageId?: string | null
}) {
  return {
    departmentId: enrollment.departmentId,
    academicSessionId: enrollment.academicSessionId,
    programId: enrollment.programId,
    programYearId: enrollment.programYearId,
    semesterId: enrollment.semesterId,
    programSemesterId: enrollment.programSemesterId ?? null,
    groupId: enrollment.groupId,
    academicYearId: enrollment.academicYearId ?? null,
    departmentLanguageId: enrollment.departmentLanguageId ?? null,
    languageId: enrollment.languageId ?? null,
  }
}

async function validatePromotionEligibility(
  studentId: string,
  enrollment: Awaited<ReturnType<typeof getActiveEnrollment>>,
  targetContext: EnrollmentContextResolved,
  manualOverride: boolean,
  tx: Tx
) {
  if (!enrollment) {
    throw new Error('Active enrollment not found')
  }
  if (!enrollment.programSemesterId || !enrollment.programSemester) {
    throw new Error('Active enrollment is missing program semester context')
  }
  if (!targetContext.programSemester) {
    throw new Error('Target promotion requires a program semester')
  }
  if (enrollment.programId !== targetContext.programId) {
    throw new Error('Program transfer must use the transfer module, not promotion')
  }
  if (targetContext.programYear.yearNumber > targetContext.program.durationYears) {
    throw new Error('Cannot promote beyond the configured program duration')
  }
  if (targetContext.programSemester.semesterNumber > targetContext.program.totalSemesters) {
    throw new Error('Cannot promote beyond the configured total semesters')
  }
  if (targetContext.programSemester.semesterNumber !== enrollment.programSemester.semesterNumber + 1) {
    throw new Error('Promotion cannot skip semester progression')
  }
  const allowedYearNumbers = new Set([enrollment.programYear.yearNumber, enrollment.programYear.yearNumber + 1])
  if (!allowedYearNumbers.has(targetContext.programYear.yearNumber)) {
    throw new Error('Promotion cannot skip academic year progression')
  }

  const curriculumCount = await tx.programSubject.count({
    where: {
      programId: enrollment.programId,
      programYearId: enrollment.programYearId,
      semesterId: enrollment.semesterId,
      isActive: true,
    },
  })

  if (curriculumCount === 0) {
    throw new Error('Current enrollment curriculum is missing')
  }

  const currentOfferings = await tx.academicOffering.findMany({
    where: {
      academicSessionId: enrollment.academicSessionId,
      programId: enrollment.programId,
      programYearId: enrollment.programYearId,
      semesterId: enrollment.semesterId,
      groupId: enrollment.groupId,
      isActive: true,
    },
    select: { id: true },
  })

  if (currentOfferings.length > 0 && !manualOverride) {
    const results = await tx.examResult.findMany({
      where: {
        studentId,
        exam: {
          academicOfferingId: { in: currentOfferings.map((item) => item.id) },
        },
      },
      select: {
        examId: true,
        status: true,
      },
    })

    const publishedResults = results.filter((item) => item.status === ResultStatus.PUBLISHED)
    const unpublishedResults = results.filter((item) => item.status !== ResultStatus.PUBLISHED)

    if (publishedResults.length === 0 || unpublishedResults.length > 0) {
      throw new Error('Promotion requires all current-context results to be published')
    }
  }
}

export async function createEnrollment(
  studentId: string,
  input: EnrollmentContextInput & {
    enrolledAt?: Date
    status?: StudentEnrollmentStatus
    notes?: string | null
  },
  actor: LifecycleActor = {}
) {
  return prisma.$transaction(async (tx) => {
    const student = await getStudentOrThrow(studentId, tx)
    const activeEnrollment = await getActiveEnrollment(studentId, tx)
    if (activeEnrollment) {
      throw new Error('Student already has an active enrollment')
    }

    const context = await resolveEnrollmentContext(input, tx)
    if (student.departmentId !== context.departmentId) {
      throw new Error('Student does not belong to the selected department')
    }

    const enrollment = await tx.studentEnrollment.create({
      data: {
        studentId,
        departmentId: context.departmentId,
        academicYearId: context.academicYearId ?? null,
        academicSessionId: context.academicSessionId,
        programId: context.programId,
        programYearId: context.programYearId,
        semesterId: context.semesterId,
        programSemesterId: context.programSemesterId ?? null,
        groupId: context.groupId,
        departmentLanguageId: context.departmentLanguageId ?? null,
        languageId: context.languageId ?? null,
        status: input.status ?? StudentEnrollmentStatus.ACTIVE,
        enrolledAt: input.enrolledAt ?? new Date(),
        notes: input.notes ?? null,
      },
    })

    await createHistoryEntry({
      studentId,
      enrollmentId: enrollment.id,
      actorUserId: actor.actorUserId ?? null,
      eventType: StudentAcademicHistoryEventType.ENROLLMENT,
      reason: 'Initial enrollment',
      notes: input.notes ?? null,
      occurredAt: input.enrolledAt ?? new Date(),
      ...buildTargetHistorySnapshot(context, input.status ?? StudentEnrollmentStatus.ACTIVE),
    }, tx)

    const legacySync = await syncLegacySubjectsForEnrollment(studentId, context, tx)
    await createLifecycleAuditLog(tx, {
      actor,
      studentUserId: student.userId,
      action: 'STUDENT_ENROLLMENT_CREATED',
      details: {
        operationType: 'ENROLLMENT_CREATE',
        previousContext: null,
        newContext: getEnrollmentContextForAudit(enrollment),
        override: false,
        reason: input.notes ?? 'Initial enrollment',
        legacySync,
      },
    })
    if (legacySync.created > 0) {
      await createHistoryEntry({
        studentId,
        enrollmentId: enrollment.id,
        actorUserId: actor.actorUserId ?? null,
        eventType: StudentAcademicHistoryEventType.LEGACY_SYNC,
        reason: 'Legacy StudentSubject synchronized from academic offerings',
        notes: JSON.stringify(legacySync),
        occurredAt: input.enrolledAt ?? new Date(),
        ...buildTargetHistorySnapshot(context, input.status ?? StudentEnrollmentStatus.ACTIVE),
      }, tx)
    }
    return { enrollment, legacySync }
  }, LIFECYCLE_TX_OPTIONS)
}

export async function updateEnrollment(
  enrollmentId: string,
  input: Partial<EnrollmentContextInput> & {
    enrolledAt?: Date
    endedAt?: Date | null
    graduationDate?: Date | null
    status?: StudentEnrollmentStatus
    isActive?: boolean
    notes?: string | null
  },
  actor: LifecycleActor = {}
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.studentEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { student: { include: { user: true } } },
    })
    if (!existing) throw new Error('Enrollment not found')

    const nextContext = {
      departmentId: input.departmentId ?? existing.departmentId,
      academicSessionId: input.academicSessionId ?? existing.academicSessionId,
      programId: input.programId ?? existing.programId,
      programYearId: input.programYearId ?? existing.programYearId,
      semesterId: input.semesterId ?? existing.semesterId,
      programSemesterId: input.programSemesterId ?? existing.programSemesterId,
      groupId: input.groupId ?? existing.groupId,
      academicYearId: input.academicYearId ?? existing.academicYearId,
      departmentLanguageId: input.departmentLanguageId ?? existing.departmentLanguageId,
      languageId: input.languageId ?? existing.languageId,
    }

    const context = await resolveEnrollmentContext(nextContext, tx)

    if ((input.status === StudentEnrollmentStatus.ACTIVE || input.isActive === true) && existing.status !== StudentEnrollmentStatus.ACTIVE) {
      const conflicting = await tx.studentEnrollment.findFirst({
        where: {
          studentId: existing.studentId,
          id: { not: existing.id },
          status: StudentEnrollmentStatus.ACTIVE,
          isActive: true,
        },
      })
      if (conflicting) {
        throw new Error('Student already has another active enrollment')
      }
    }

    const updated = await tx.studentEnrollment.update({
      where: { id: enrollmentId },
      data: {
        ...nextContext,
        status: input.status ?? existing.status,
        enrolledAt: input.enrolledAt ?? existing.enrolledAt,
        endedAt: input.endedAt === undefined ? existing.endedAt : input.endedAt,
        graduationDate: input.graduationDate === undefined ? existing.graduationDate : input.graduationDate,
        isActive: input.isActive ?? existing.isActive,
        notes: input.notes ?? existing.notes,
      },
    })

    await createHistoryEntry({
      studentId: existing.studentId,
      enrollmentId: updated.id,
      actorUserId: actor.actorUserId ?? null,
      eventType: StudentAcademicHistoryEventType.MANUAL_CORRECTION,
      reason: 'Enrollment updated',
      notes: input.notes ?? null,
      occurredAt: new Date(),
      ...buildHistorySnapshot(existing),
      ...buildTargetHistorySnapshot(context, input.status ?? existing.status),
    }, tx)

    await createLifecycleAuditLog(tx, {
      actor,
      studentUserId: existing.student.userId,
      action: 'STUDENT_ENROLLMENT_UPDATED',
      details: {
        operationType: 'ENROLLMENT_UPDATE',
        previousContext: getEnrollmentContextForAudit(existing),
        newContext: getEnrollmentContextForAudit(updated),
        override: false,
        reason: input.notes ?? 'Enrollment updated',
      },
    })

    return updated
  }, LIFECYCLE_TX_OPTIONS)
}

export async function deactivateEnrollment(
  enrollmentId: string,
  reason: string,
  actor: LifecycleActor = {}
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.studentEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { student: { include: { user: true } } },
    })
    if (!existing) throw new Error('Enrollment not found')

    const updated = await tx.studentEnrollment.update({
      where: { id: enrollmentId },
      data: {
        isActive: false,
        endedAt: existing.endedAt ?? new Date(),
        status: existing.status === StudentEnrollmentStatus.ACTIVE ? StudentEnrollmentStatus.DROPPED : existing.status,
        notes: reason,
      },
    })

    await createHistoryEntry({
      studentId: existing.studentId,
      enrollmentId: existing.id,
      actorUserId: actor.actorUserId ?? null,
      eventType: StudentAcademicHistoryEventType.STATUS_CHANGE,
      reason,
      notes: reason,
      occurredAt: updated.endedAt ?? new Date(),
      ...buildHistorySnapshot(existing),
      toStatus: updated.status,
    }, tx)

    await createLifecycleAuditLog(tx, {
      actor,
      studentUserId: existing.student.userId,
      action: 'STUDENT_ENROLLMENT_DEACTIVATED',
      details: {
        operationType: 'STATUS_CHANGE',
        previousContext: getEnrollmentContextForAudit(existing),
        newContext: { status: updated.status, isActive: false },
        override: false,
        reason,
      },
    })

    return updated
  }, LIFECYCLE_TX_OPTIONS)
}

export async function evaluatePromotionEligibility(
  studentId: string,
  input: EnrollmentContextInput,
  manualOverride = false
) {
  try {
    await prisma.$transaction(async (tx) => {
      const activeEnrollment = await getActiveEnrollment(studentId, tx)
      const targetContext = await resolveEnrollmentContext(input, tx)
      await validatePromotionEligibility(studentId, activeEnrollment, targetContext, manualOverride, tx)
    }, LIFECYCLE_TX_OPTIONS)
    return { eligible: true, reasons: [] as string[] }
  } catch (error) {
    return {
      eligible: manualOverride,
      reasons: [error instanceof Error ? error.message : 'Unknown promotion validation failure'],
    }
  }
}

export async function promoteStudent(
  studentId: string,
  input: EnrollmentContextInput & {
    manualOverride?: boolean
    overrideReason?: string | null
    notes?: string | null
  },
  actor: LifecycleActor = {}
) {
  return prisma.$transaction(async (tx) => {
    const activeEnrollment = await getActiveEnrollment(studentId, tx)
    if (!activeEnrollment) {
      throw new Error('Active enrollment not found')
    }

    const targetContext = await resolveEnrollmentContext(input, tx)
    await validatePromotionEligibility(studentId, activeEnrollment, targetContext, Boolean(input.manualOverride), tx)

    const promotedAt = new Date()
    await closeEnrollment(activeEnrollment.id, StudentEnrollmentStatus.TRANSFERRED, promotedAt, tx)

    const nextEnrollment = await tx.studentEnrollment.create({
      data: {
        studentId,
        departmentId: targetContext.departmentId,
        academicYearId: targetContext.academicYearId ?? null,
        academicSessionId: targetContext.academicSessionId,
        programId: targetContext.programId,
        programYearId: targetContext.programYearId,
        semesterId: targetContext.semesterId,
        programSemesterId: targetContext.programSemesterId ?? null,
        groupId: targetContext.groupId,
        departmentLanguageId: targetContext.departmentLanguageId ?? null,
        languageId: targetContext.languageId ?? null,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: promotedAt,
        notes: input.notes ?? null,
      },
    })

    const promotion = await tx.studentPromotion.create({
      data: {
        studentId,
        fromEnrollmentId: activeEnrollment.id,
        toEnrollmentId: nextEnrollment.id,
        fromAcademicSessionId: activeEnrollment.academicSessionId,
        toAcademicSessionId: targetContext.academicSessionId,
        fromProgramId: activeEnrollment.programId,
        toProgramId: targetContext.programId,
        fromProgramYearId: activeEnrollment.programYearId,
        toProgramYearId: targetContext.programYearId,
        fromSemesterId: activeEnrollment.semesterId,
        toSemesterId: targetContext.semesterId,
        fromProgramSemesterId: activeEnrollment.programSemesterId,
        toProgramSemesterId: targetContext.programSemesterId ?? null,
        fromGroupId: activeEnrollment.groupId,
        toGroupId: targetContext.groupId,
        status: input.manualOverride ? StudentPromotionStatus.OVERRIDDEN : StudentPromotionStatus.PROMOTED,
        manualOverride: Boolean(input.manualOverride),
        overrideReason: input.overrideReason ?? null,
        curriculumValidated: true,
        resultPublishedValidated: true,
        promotedAt,
        notes: input.notes ?? null,
      },
    })

    await createHistoryEntry({
      studentId,
      enrollmentId: nextEnrollment.id,
      actorUserId: actor.actorUserId ?? null,
      eventType: StudentAcademicHistoryEventType.PROMOTION,
      reason: input.overrideReason ?? 'Student promoted',
      notes: input.notes ?? null,
      occurredAt: promotedAt,
      ...buildHistorySnapshot(activeEnrollment),
      ...buildTargetHistorySnapshot(targetContext, StudentEnrollmentStatus.ACTIVE),
    }, tx)

    const legacySync = await syncLegacySubjectsForEnrollment(studentId, targetContext, tx)
    await createLifecycleAuditLog(tx, {
      actor,
      studentUserId: activeEnrollment.student.userId,
      action: input.manualOverride ? 'STUDENT_PROMOTION_OVERRIDE' : 'STUDENT_PROMOTION_CREATED',
      details: {
        operationType: 'PROMOTION',
        previousContext: getEnrollmentContextForAudit(activeEnrollment),
        newContext: getEnrollmentContextForAudit(nextEnrollment),
        override: Boolean(input.manualOverride),
        originalValidationFailures: input.manualOverride ? ['Manual override bypassed standard promotion checks'] : [],
        reason: input.overrideReason ?? input.notes ?? 'Student promoted',
        promotionId: promotion.id,
        timestamp: promotedAt.toISOString(),
        legacySync,
      },
    })
    if (legacySync.created > 0) {
      await createHistoryEntry({
        studentId,
        enrollmentId: nextEnrollment.id,
        actorUserId: actor.actorUserId ?? null,
        eventType: StudentAcademicHistoryEventType.LEGACY_SYNC,
        reason: 'Legacy StudentSubject synchronized after promotion',
        notes: JSON.stringify(legacySync),
        occurredAt: promotedAt,
        ...buildTargetHistorySnapshot(targetContext, StudentEnrollmentStatus.ACTIVE),
      }, tx)
    }
    return { promotion, enrollment: nextEnrollment, legacySync }
  }, LIFECYCLE_TX_OPTIONS)
}

export async function transferStudent(
  studentId: string,
  input: EnrollmentContextInput & {
    transferType: StudentTransferType
    effectiveDate?: Date
    reason?: string | null
    approvalNote?: string | null
    notes?: string | null
  },
  actor: LifecycleActor = {}
) {
  return prisma.$transaction(async (tx) => {
    const activeEnrollment = await getActiveEnrollment(studentId, tx)
    if (!activeEnrollment) {
      throw new Error('Active enrollment not found')
    }

    const targetContext = await resolveEnrollmentContext(input, tx)
    const changedDepartment = activeEnrollment.departmentId !== targetContext.departmentId
    const changedProgram = activeEnrollment.programId !== targetContext.programId
    const changedGroup = activeEnrollment.groupId !== targetContext.groupId

    if (input.transferType === StudentTransferType.DEPARTMENT && !changedDepartment) {
      throw new Error('Department transfer requires a different target department')
    }
    if (input.transferType === StudentTransferType.PROGRAM && !changedProgram) {
      throw new Error('Program transfer requires a different target program')
    }
    if (input.transferType === StudentTransferType.GROUP && !changedGroup) {
      throw new Error('Group transfer requires a different target group')
    }

    const transferredAt = input.effectiveDate ?? new Date()
    await closeEnrollment(activeEnrollment.id, StudentEnrollmentStatus.TRANSFERRED, transferredAt, tx)

    const nextEnrollment = await tx.studentEnrollment.create({
      data: {
        studentId,
        departmentId: targetContext.departmentId,
        academicYearId: targetContext.academicYearId ?? null,
        academicSessionId: targetContext.academicSessionId,
        programId: targetContext.programId,
        programYearId: targetContext.programYearId,
        semesterId: targetContext.semesterId,
        programSemesterId: targetContext.programSemesterId ?? null,
        groupId: targetContext.groupId,
        departmentLanguageId: targetContext.departmentLanguageId ?? null,
        languageId: targetContext.languageId ?? null,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: transferredAt,
        notes: input.notes ?? null,
      },
    })

    const transfer = await tx.studentTransfer.create({
      data: {
        studentId,
        fromEnrollmentId: activeEnrollment.id,
        toEnrollmentId: nextEnrollment.id,
        transferType: input.transferType,
        fromDepartmentId: activeEnrollment.departmentId,
        toDepartmentId: targetContext.departmentId,
        fromAcademicSessionId: activeEnrollment.academicSessionId,
        toAcademicSessionId: targetContext.academicSessionId,
        fromProgramId: activeEnrollment.programId,
        toProgramId: targetContext.programId,
        fromProgramYearId: activeEnrollment.programYearId,
        toProgramYearId: targetContext.programYearId,
        fromSemesterId: activeEnrollment.semesterId,
        toSemesterId: targetContext.semesterId,
        fromProgramSemesterId: activeEnrollment.programSemesterId,
        toProgramSemesterId: targetContext.programSemesterId ?? null,
        fromGroupId: activeEnrollment.groupId,
        toGroupId: targetContext.groupId,
        transferredAt,
        reason: input.reason ?? null,
        notes: input.approvalNote ?? input.notes ?? null,
      },
    })

    const eventType = input.transferType === StudentTransferType.GROUP
      ? StudentAcademicHistoryEventType.GROUP_TRANSFER
      : input.transferType === StudentTransferType.DEPARTMENT
        ? StudentAcademicHistoryEventType.DEPARTMENT_TRANSFER
        : StudentAcademicHistoryEventType.PROGRAM_TRANSFER

    await createHistoryEntry({
      studentId,
      enrollmentId: nextEnrollment.id,
      actorUserId: actor.actorUserId ?? null,
      eventType,
      reason: input.reason ?? 'Student transfer',
      notes: input.notes ?? null,
      occurredAt: transferredAt,
      ...buildHistorySnapshot(activeEnrollment),
      ...buildTargetHistorySnapshot(targetContext, StudentEnrollmentStatus.ACTIVE),
    }, tx)

    const legacySync = await syncLegacySubjectsForEnrollment(studentId, targetContext, tx)
    await createLifecycleAuditLog(tx, {
      actor,
      studentUserId: activeEnrollment.student.userId,
      action: 'STUDENT_TRANSFER_CREATED',
      details: {
        operationType: 'TRANSFER',
        transferType: input.transferType,
        previousContext: getEnrollmentContextForAudit(activeEnrollment),
        newContext: getEnrollmentContextForAudit(nextEnrollment),
        override: false,
        reason: input.reason ?? null,
        approvalNote: input.approvalNote ?? null,
        transferId: transfer.id,
        timestamp: transferredAt.toISOString(),
        legacySync,
      },
    })
    if (legacySync.created > 0) {
      await createHistoryEntry({
        studentId,
        enrollmentId: nextEnrollment.id,
        actorUserId: actor.actorUserId ?? null,
        eventType: StudentAcademicHistoryEventType.LEGACY_SYNC,
        reason: 'Legacy StudentSubject synchronized after transfer',
        notes: JSON.stringify(legacySync),
        occurredAt: transferredAt,
        ...buildTargetHistorySnapshot(targetContext, StudentEnrollmentStatus.ACTIVE),
      }, tx)
    }
    return { transfer, enrollment: nextEnrollment, legacySync }
  }, LIFECYCLE_TX_OPTIONS)
}

export async function placeStudentOnLeave(
  studentId: string,
  input: {
    leaveType: StudentLeaveType
    startsAt: Date
    endsAt?: Date | null
    status?: string | null
    reason?: string | null
    supportingNote?: string | null
    notes?: string | null
  },
  actor: LifecycleActor = {}
) {
  return prisma.$transaction(async (tx) => {
    const activeEnrollment = await getActiveEnrollment(studentId, tx)
    if (!activeEnrollment) {
      throw new Error('Active enrollment not found')
    }
    if (input.endsAt && input.endsAt < input.startsAt) {
      throw new Error('Leave end date must be after the start date')
    }

    const overlappingLeave = await tx.studentLeave.findFirst({
      where: {
        studentId,
        startsAt: input.endsAt ? { lte: input.endsAt } : { lte: input.startsAt },
        AND: [openLeaveFilter],
        OR: [{ endsAt: null }, { endsAt: { gte: input.startsAt } }],
      },
    })
    if (overlappingLeave) {
      throw new Error('Open leave records cannot overlap')
    }

    const endedEnrollment = await closeEnrollment(activeEnrollment.id, StudentEnrollmentStatus.LEAVE, input.startsAt, tx)
    const leave = await tx.studentLeave.create({
      data: {
        studentId,
        enrollmentId: activeEnrollment.id,
        leaveType: input.leaveType,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        status: input.status ?? 'APPROVED',
        reason: input.reason ?? null,
        notes: input.supportingNote ?? input.notes ?? null,
      },
    })

    await createHistoryEntry({
      studentId,
      enrollmentId: activeEnrollment.id,
      actorUserId: actor.actorUserId ?? null,
      eventType: StudentAcademicHistoryEventType.ACADEMIC_LEAVE,
      reason: input.reason ?? input.leaveType,
      notes: input.notes ?? null,
      occurredAt: input.startsAt,
      ...buildHistorySnapshot({ ...endedEnrollment, status: StudentEnrollmentStatus.LEAVE }),
      toStatus: StudentEnrollmentStatus.LEAVE,
    }, tx)

    await createLifecycleAuditLog(tx, {
      actor,
      studentUserId: activeEnrollment.student.userId,
      action: 'STUDENT_LEAVE_CREATED',
      details: {
        operationType: 'LEAVE',
        previousContext: getEnrollmentContextForAudit(activeEnrollment),
        newContext: { status: StudentEnrollmentStatus.LEAVE },
        override: false,
        reason: input.reason ?? input.leaveType,
        leaveId: leave.id,
        status: input.status ?? 'APPROVED',
        timestamp: input.startsAt.toISOString(),
      },
    })

    return { leave, enrollment: endedEnrollment }
  }, LIFECYCLE_TX_OPTIONS)
}

export async function readmitStudent(
  studentId: string,
  input: EnrollmentContextInput & {
    readmittedAt?: Date
    approvalReason?: string | null
    notes?: string | null
  },
  actor: LifecycleActor = {}
) {
  return prisma.$transaction(async (tx) => {
    const student = await getStudentOrThrow(studentId, tx)
    const activeEnrollment = await getActiveEnrollment(studentId, tx)
    if (activeEnrollment) {
      throw new Error('Student already has an active enrollment')
    }

    const [latestLeave] = await tx.studentLeave.findMany({
      where: { studentId, ...openLeaveFilter },
      orderBy: [{ approvedAt: 'desc' }, { createdAt: 'desc' }],
      take: 1,
    })
    const inactiveEnrollment = await tx.studentEnrollment.findFirst({
      where: {
        studentId,
        isActive: false,
      },
      orderBy: [{ endedAt: 'desc' }, { updatedAt: 'desc' }],
    })
    if (!latestLeave && !inactiveEnrollment) {
      throw new Error('Student does not have a prior leave or inactive enrollment record')
    }
    const graduation = await tx.studentGraduation.findFirst({
      where: { studentId },
      select: { id: true },
    })
    if (graduation) {
      throw new Error('Readmission after graduation is not allowed')
    }

    const context = await resolveEnrollmentContext(input, tx)
    const readmittedAt = input.readmittedAt ?? new Date()

    const enrollment = await tx.studentEnrollment.create({
      data: {
        studentId,
        departmentId: context.departmentId,
        academicYearId: context.academicYearId ?? null,
        academicSessionId: context.academicSessionId,
        programId: context.programId,
        programYearId: context.programYearId,
        semesterId: context.semesterId,
        programSemesterId: context.programSemesterId ?? null,
        groupId: context.groupId,
        departmentLanguageId: context.departmentLanguageId ?? null,
        languageId: context.languageId ?? null,
        status: StudentEnrollmentStatus.ACTIVE,
        enrolledAt: readmittedAt,
        notes: input.notes ?? null,
      },
    })

    if (latestLeave) {
      await tx.studentLeave.update({
        where: { id: latestLeave.id },
        data: { readmittedAt },
      })
    }

    await createHistoryEntry({
      studentId,
      enrollmentId: enrollment.id,
      actorUserId: actor.actorUserId ?? null,
      eventType: StudentAcademicHistoryEventType.READMISSION,
      reason: 'Student readmitted',
      notes: input.notes ?? null,
      occurredAt: readmittedAt,
      ...buildHistorySnapshot(inactiveEnrollment),
      ...buildTargetHistorySnapshot(context, StudentEnrollmentStatus.ACTIVE),
    }, tx)

    const legacySync = await syncLegacySubjectsForEnrollment(studentId, context, tx)
    await createLifecycleAuditLog(tx, {
      actor,
      studentUserId: student.userId,
      action: 'STUDENT_READMISSION_CREATED',
      details: {
        operationType: 'READMISSION',
        previousContext: inactiveEnrollment ? getEnrollmentContextForAudit(inactiveEnrollment) : null,
        newContext: getEnrollmentContextForAudit(enrollment),
        override: false,
        reason: input.approvalReason ?? input.notes ?? 'Student readmitted',
        leaveId: latestLeave?.id ?? null,
        timestamp: readmittedAt.toISOString(),
        legacySync,
      },
    })
    if (legacySync.created > 0) {
      await createHistoryEntry({
        studentId,
        enrollmentId: enrollment.id,
        actorUserId: actor.actorUserId ?? null,
        eventType: StudentAcademicHistoryEventType.LEGACY_SYNC,
        reason: 'Legacy StudentSubject synchronized after readmission',
        notes: JSON.stringify(legacySync),
        occurredAt: readmittedAt,
        ...buildTargetHistorySnapshot(context, StudentEnrollmentStatus.ACTIVE),
      }, tx)
    }
    return { enrollment, legacySync }
  }, LIFECYCLE_TX_OPTIONS)
}

export async function graduateStudent(
  studentId: string,
  input: {
    graduatedAt: Date
    finalCgpa?: number | null
    degreeClassification?: string | null
    certificateNumber?: string | null
    degreeAwarded: string
    alumniAt?: Date | null
    notes?: string | null
  },
  actor: LifecycleActor = {}
) {
  return prisma.$transaction(async (tx) => {
    const activeEnrollment = await getActiveEnrollment(studentId, tx)
    if (!activeEnrollment) {
      throw new Error('Active enrollment not found')
    }
    const existingGraduation = await tx.studentGraduation.findFirst({
      where: { studentId },
      select: { id: true },
    })
    if (existingGraduation) {
      throw new Error('Graduation record already exists for this student')
    }
    if (!activeEnrollment.programSemester) {
      throw new Error('Active enrollment is missing program semester context')
    }
    if (activeEnrollment.programSemester.semesterNumber !== activeEnrollment.program.totalSemesters) {
      throw new Error('Student cannot graduate before the final semester')
    }
    const openLeave = await tx.studentLeave.findFirst({
      where: { studentId, ...openLeaveFilter },
      select: { id: true },
    })
    if (openLeave) {
      throw new Error('Student cannot graduate while on active leave')
    }
    const curriculumCount = await tx.programSubject.count({
      where: {
        programId: activeEnrollment.programId,
        isActive: true,
      },
    })
    if (curriculumCount === 0) {
      throw new Error('Graduation requires published results for a valid curriculum')
    }
    const enrollmentOfferings = await tx.academicOffering.findMany({
      where: {
        programId: activeEnrollment.programId,
        programYearId: activeEnrollment.programYearId,
        semesterId: activeEnrollment.semesterId,
        groupId: activeEnrollment.groupId,
        isActive: true,
      },
      select: { id: true },
    })
    const enrollmentExams = enrollmentOfferings.length > 0
      ? await tx.exam.findMany({
          where: {
            academicOfferingId: { in: enrollmentOfferings.map((item) => item.id) },
            status: ExamStatus.COMPLETED,
          },
          select: { id: true },
        })
      : []
    if (enrollmentExams.length > 0) {
      const publishedResults = await tx.examResult.findMany({
        where: {
          studentId,
          examId: { in: enrollmentExams.map((item) => item.id) },
          status: ResultStatus.PUBLISHED,
        },
        select: { examId: true },
      })
      const publishedExamIds = new Set(publishedResults.map((item) => item.examId))
      const unpublished = enrollmentExams.filter((exam) => !publishedExamIds.has(exam.id))
      if (unpublished.length > 0) {
        throw new Error('Graduation requires all final-context results to be published')
      }
    }

    const graduatedEnrollment = await tx.studentEnrollment.update({
      where: { id: activeEnrollment.id },
      data: {
        status: input.alumniAt ? StudentEnrollmentStatus.ALUMNI : StudentEnrollmentStatus.GRADUATED,
        graduationDate: input.graduatedAt,
        endedAt: input.graduatedAt,
        isActive: false,
        notes: input.notes ?? null,
      },
    })

    const graduation = await tx.studentGraduation.create({
      data: {
        studentId,
        enrollmentId: activeEnrollment.id,
        graduatedAt: input.graduatedAt,
        finalCgpa: input.finalCgpa ?? null,
        degreeClassification: input.degreeClassification ?? null,
        certificateNumber: input.certificateNumber ?? null,
        degreeAwarded: input.degreeAwarded,
        alumniAt: input.alumniAt ?? null,
        notes: input.notes ?? null,
      },
    })

    await createHistoryEntry({
      studentId,
      enrollmentId: activeEnrollment.id,
      actorUserId: actor.actorUserId ?? null,
      eventType: StudentAcademicHistoryEventType.GRADUATION,
      reason: input.degreeAwarded,
      notes: input.notes ?? null,
      occurredAt: input.graduatedAt,
      ...buildHistorySnapshot(activeEnrollment),
      toStatus: input.alumniAt ? StudentEnrollmentStatus.ALUMNI : StudentEnrollmentStatus.GRADUATED,
    }, tx)

    if (input.alumniAt) {
      await createHistoryEntry({
        studentId,
        enrollmentId: activeEnrollment.id,
        actorUserId: actor.actorUserId ?? null,
        eventType: StudentAcademicHistoryEventType.ALUMNI,
        reason: 'Student marked as alumni',
        notes: input.notes ?? null,
        occurredAt: input.alumniAt,
        ...buildHistorySnapshot(graduatedEnrollment),
        toStatus: StudentEnrollmentStatus.ALUMNI,
      }, tx)
    }

    await createLifecycleAuditLog(tx, {
      actor,
      studentUserId: activeEnrollment.student.userId,
      action: 'STUDENT_GRADUATION_CREATED',
      details: {
        operationType: 'GRADUATION',
        previousContext: getEnrollmentContextForAudit(activeEnrollment),
        newContext: { status: input.alumniAt ? StudentEnrollmentStatus.ALUMNI : StudentEnrollmentStatus.GRADUATED },
        override: false,
        reason: input.degreeAwarded,
        graduationId: graduation.id,
        timestamp: input.graduatedAt.toISOString(),
      },
    })

    return { graduation, enrollment: graduatedEnrollment }
  }, LIFECYCLE_TX_OPTIONS)
}

export async function markStudentAsAlumni(
  studentId: string,
  alumniAt: Date,
  notes?: string | null,
  actor: LifecycleActor = {}
) {
  return prisma.$transaction(async (tx) => {
    const graduation = await tx.studentGraduation.findFirst({
      where: { studentId },
      orderBy: { graduatedAt: 'desc' },
    })
    if (!graduation) {
      throw new Error('Graduation record not found')
    }

    const enrollment = await tx.studentEnrollment.update({
      where: { id: graduation.enrollmentId },
      data: {
        status: StudentEnrollmentStatus.ALUMNI,
        notes: notes ?? undefined,
      },
    })

    await tx.studentGraduation.update({
      where: { id: graduation.id },
      data: { alumniAt, notes: notes ?? undefined },
    })

    await createHistoryEntry({
      studentId,
      enrollmentId: enrollment.id,
      actorUserId: actor.actorUserId ?? null,
      eventType: StudentAcademicHistoryEventType.ALUMNI,
      reason: 'Student marked as alumni',
      notes: notes ?? null,
      occurredAt: alumniAt,
      ...buildHistorySnapshot(enrollment),
      toStatus: StudentEnrollmentStatus.ALUMNI,
    }, tx)

    await createLifecycleAuditLog(tx, {
      actor,
      studentUserId: null,
      action: 'STUDENT_STATUS_ALUMNI',
      details: {
        operationType: 'STATUS_CHANGE',
        previousContext: getEnrollmentContextForAudit(enrollment),
        newContext: { status: StudentEnrollmentStatus.ALUMNI },
        override: false,
        reason: notes ?? 'Student marked as alumni',
        timestamp: alumniAt.toISOString(),
      },
    })

    return enrollment
  }, LIFECYCLE_TX_OPTIONS)
}

export async function getStudentTimeline(studentId: string) {
  return prisma.studentAcademicHistory.findMany({
    where: { studentId },
    include: {
      actor: { select: { id: true, name: true, role: true } },
      fromDepartment: { select: { id: true, name: true } },
      toDepartment: { select: { id: true, name: true } },
      fromProgram: { select: { id: true, name: true } },
      toProgram: { select: { id: true, name: true } },
      fromProgramYear: { select: { id: true, name: true, yearNumber: true } },
      toProgramYear: { select: { id: true, name: true, yearNumber: true } },
      fromSemester: { select: { id: true, name: true, number: true } },
      toSemester: { select: { id: true, name: true, number: true } },
      fromGroup: { select: { id: true, name: true, code: true } },
      toGroup: { select: { id: true, name: true, code: true } },
      fromAcademicSession: { select: { id: true, name: true, code: true } },
      toAcademicSession: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function listStudentEnrollments(
  where: Prisma.StudentEnrollmentWhereInput,
  page: number,
  limit: number
) {
  const skip = (page - 1) * limit
  const [items, total] = await Promise.all([
    prisma.studentEnrollment.findMany({
      where,
      include: {
        student: { include: { user: { select: { id: true, name: true, email: true, isActive: true } } } },
        department: true,
        academicYear: true,
        academicSession: true,
        program: true,
        programYear: true,
        semester: true,
        programSemester: true,
        group: true,
      },
      orderBy: [{ isActive: 'desc' }, { enrolledAt: 'desc' }],
      skip,
      take: limit,
    }),
    prisma.studentEnrollment.count({ where }),
  ])

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}
