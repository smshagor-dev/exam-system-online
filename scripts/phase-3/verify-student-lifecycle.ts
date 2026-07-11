import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'

async function getBaseDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const envRaw = await readFile('.env', 'utf8')
  const match = envRaw.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)
  if (!match) {
    throw new Error('DATABASE_URL is required for Phase 3 verification.')
  }

  return match[1]
}

function withDatabaseName(databaseUrl: string, suffix: string) {
  const [base, query = ''] = databaseUrl.split('?')
  const dbName = base.slice(base.lastIndexOf('/') + 1)
  const root = base.slice(0, base.lastIndexOf('/') + 1)
  return `${root}${dbName}${suffix}${query ? `?${query}` : ''}`
}

type CategoryKey =
  | 'Enrollment'
  | 'History'
  | 'Promotion'
  | 'Transfer'
  | 'Leave'
  | 'Readmission'
  | 'Graduation'
  | 'Legacy'

type Summary = Record<CategoryKey, number>

function createSummary(): Summary {
  return {
    Enrollment: 0,
    History: 0,
    Promotion: 0,
    Transfer: 0,
    Leave: 0,
    Readmission: 0,
    Graduation: 0,
    Legacy: 0,
  }
}

function note(summary: Summary, key: CategoryKey) {
  summary[key] += 1
}

async function main() {
  const baseUrl = await getBaseDatabaseUrl()
  process.env.DATABASE_URL = withDatabaseName(baseUrl, '_phase3_tests')

  const { PrismaClient, StudentAcademicHistoryEventType, StudentEnrollmentStatus } = await import('@prisma/client')
  const prisma = new PrismaClient()

  try {
    const criticalErrors: string[] = []
    const warnings: string[] = []
    const acceptedExceptions: string[] = []
    const totals = createSummary()

    const [
      students,
      enrollments,
      histories,
      promotions,
      transfers,
      leaves,
      graduations,
      studentSubjects,
      activityLogs,
    ] = await Promise.all([
      prisma.studentProfile.findMany({
        include: {
          user: true,
          enrollments: true,
          leaveRecords: true,
          graduationRecords: true,
          subjects: true,
        },
      }),
      prisma.studentEnrollment.findMany({
        include: {
          student: true,
          department: true,
          academicSession: true,
          program: true,
          programYear: true,
          semester: true,
          programSemester: true,
          group: true,
          departmentLanguage: true,
        },
      }),
      prisma.studentAcademicHistory.findMany({
        include: {
          student: true,
          enrollment: true,
        },
        orderBy: [{ studentId: 'asc' }, { occurredAt: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.studentPromotion.findMany({
        include: {
          fromEnrollment: true,
          toEnrollment: true,
          fromProgram: true,
          toProgram: true,
          fromProgramYear: true,
          toProgramYear: true,
          fromSemester: true,
          toSemester: true,
        },
      }),
      prisma.studentTransfer.findMany({
        include: {
          fromEnrollment: true,
          toEnrollment: true,
        },
      }),
      prisma.studentLeave.findMany({
        include: {
          enrollment: true,
          student: true,
        },
      }),
      prisma.studentGraduation.findMany({
        include: {
          enrollment: true,
          student: true,
        },
      }),
      prisma.studentSubject.findMany(),
      prisma.activityLog.findMany(),
    ])

    const studentIds = new Set(students.map((item) => item.id))
    const enrollmentById = new Map(enrollments.map((item) => [item.id, item] as const))
    const historiesByStudent = new Map<string, typeof histories>()
    for (const history of histories) {
      const bucket = historiesByStudent.get(history.studentId) ?? []
      bucket.push(history)
      historiesByStudent.set(history.studentId, bucket)
    }

    const activeCounts = new Map<string, number>()
    for (const enrollment of enrollments) {
      if (enrollment.isActive && enrollment.status === StudentEnrollmentStatus.ACTIVE) {
        activeCounts.set(enrollment.studentId, (activeCounts.get(enrollment.studentId) ?? 0) + 1)
      }

      note(totals, 'Enrollment')
      if (!studentIds.has(enrollment.studentId)) {
        criticalErrors.push(`Enrollment ${enrollment.id} references a missing student`)
      }
      if (!enrollment.program.isActive) {
        criticalErrors.push(`Enrollment ${enrollment.id} references inactive program ${enrollment.programId}`)
      }
      if (!enrollment.academicSession.isActive) {
        criticalErrors.push(`Enrollment ${enrollment.id} references inactive session ${enrollment.academicSessionId}`)
      }
      if (!enrollment.programYear.isActive) {
        criticalErrors.push(`Enrollment ${enrollment.id} references inactive program year ${enrollment.programYearId}`)
      }
      if (!enrollment.semester.isActive) {
        criticalErrors.push(`Enrollment ${enrollment.id} references inactive semester ${enrollment.semesterId}`)
      }
      if (!enrollment.group.isActive) {
        criticalErrors.push(`Enrollment ${enrollment.id} references inactive group ${enrollment.groupId}`)
      }
      if (enrollment.programYear.programId !== enrollment.programId) {
        criticalErrors.push(`Enrollment ${enrollment.id} has program year ${enrollment.programYearId} outside program ${enrollment.programId}`)
      }
      if (enrollment.program.departmentId !== enrollment.departmentId) {
        criticalErrors.push(`Enrollment ${enrollment.id} program department mismatch`)
      }
      if (enrollment.group.departmentId && enrollment.group.departmentId !== enrollment.departmentId) {
        criticalErrors.push(`Enrollment ${enrollment.id} group department mismatch`)
      }
      if (enrollment.group.programId && enrollment.group.programId !== enrollment.programId) {
        criticalErrors.push(`Enrollment ${enrollment.id} group program mismatch`)
      }
      if (enrollment.group.academicSessionId && enrollment.group.academicSessionId !== enrollment.academicSessionId) {
        criticalErrors.push(`Enrollment ${enrollment.id} group session mismatch`)
      }
      if (enrollment.group.programYearId && enrollment.group.programYearId !== enrollment.programYearId) {
        criticalErrors.push(`Enrollment ${enrollment.id} group year mismatch`)
      }
      if (enrollment.group.currentProgramSemesterId && enrollment.programSemesterId && enrollment.group.currentProgramSemesterId !== enrollment.programSemesterId) {
        warnings.push(`Enrollment ${enrollment.id} group current semester differs from enrollment program semester`)
      }
      if (enrollment.departmentLanguage && !enrollment.departmentLanguage.isActive) {
        criticalErrors.push(`Enrollment ${enrollment.id} references inactive department language`)
      }
      if (enrollment.departmentLanguage && enrollment.departmentLanguage.departmentId !== enrollment.departmentId) {
        criticalErrors.push(`Enrollment ${enrollment.id} department language department mismatch`)
      }
      if (enrollment.departmentLanguage && enrollment.languageId && enrollment.departmentLanguage.languageId !== enrollment.languageId) {
        criticalErrors.push(`Enrollment ${enrollment.id} department language and language mismatch`)
      }
      if (enrollment.programSemester) {
        if (!enrollment.programSemester.isActive) {
          criticalErrors.push(`Enrollment ${enrollment.id} references inactive program semester`)
        }
        if (enrollment.programSemester.programId !== enrollment.programId) {
          criticalErrors.push(`Enrollment ${enrollment.id} program semester program mismatch`)
        }
        if (enrollment.programSemester.programYearId !== enrollment.programYearId) {
          criticalErrors.push(`Enrollment ${enrollment.id} program semester year mismatch`)
        }
        if (enrollment.programSemester.semesterId !== enrollment.semesterId) {
          criticalErrors.push(`Enrollment ${enrollment.id} program semester semester mismatch`)
        }
      }
    }

    for (const [studentId, count] of activeCounts.entries()) {
      if (count > 1) {
        criticalErrors.push(`Student ${studentId} has ${count} active enrollments`)
      }
    }

    const graduatedStudentIds = new Set(graduations.map((item) => item.studentId))
    for (const enrollment of enrollments) {
      if (graduatedStudentIds.has(enrollment.studentId) && enrollment.isActive) {
        criticalErrors.push(`Graduated student ${enrollment.studentId} still has an active enrollment`)
      }
    }

    for (const history of histories) {
      note(totals, 'History')
      if (!studentIds.has(history.studentId)) {
        criticalErrors.push(`History ${history.id} references missing student ${history.studentId}`)
      }
      if (history.enrollmentId && !enrollmentById.has(history.enrollmentId)) {
        criticalErrors.push(`History ${history.id} references missing enrollment ${history.enrollmentId}`)
      }
      if (!history.occurredAt) {
        criticalErrors.push(`History ${history.id} is missing occurredAt`)
      }
    }

    for (const [studentId, entries] of historiesByStudent.entries()) {
      for (let index = 1; index < entries.length; index += 1) {
        const previous = entries[index - 1]
        const current = entries[index]
        if (current.occurredAt.getTime() < previous.occurredAt.getTime()) {
          criticalErrors.push(`Student ${studentId} has out-of-order history entries ${previous.id} and ${current.id}`)
        }
      }
      const historyTypes = new Set(entries.map((item) => item.eventType))
      const student = students.find((item) => item.id === studentId)
      if (student) {
        if (student.enrollments.length > 0 && !historyTypes.has(StudentAcademicHistoryEventType.ENROLLMENT)) {
          criticalErrors.push(`Student ${studentId} has enrollments but no ENROLLMENT history`)
        }
        if (student.leaveRecords.length > 0 && !historyTypes.has(StudentAcademicHistoryEventType.ACADEMIC_LEAVE)) {
          criticalErrors.push(`Student ${studentId} has leave records but no ACADEMIC_LEAVE history`)
        }
        if (student.graduationRecords.length > 0 && !historyTypes.has(StudentAcademicHistoryEventType.GRADUATION)) {
          criticalErrors.push(`Student ${studentId} has graduation records but no GRADUATION history`)
        }
      }
    }

    const promotionKeys = new Set<string>()
    for (const promotion of promotions) {
      note(totals, 'Promotion')
      if (promotion.fromEnrollment.studentId !== promotion.studentId) {
        criticalErrors.push(`Promotion ${promotion.id} source enrollment student mismatch`)
      }
      if (!promotion.toEnrollment) {
        criticalErrors.push(`Promotion ${promotion.id} is missing its target enrollment`)
      } else {
        if (promotion.toEnrollment.studentId !== promotion.studentId) {
          criticalErrors.push(`Promotion ${promotion.id} target enrollment student mismatch`)
        }
        if (!promotion.toEnrollment.isActive || promotion.toEnrollment.status !== StudentEnrollmentStatus.ACTIVE) {
          criticalErrors.push(`Promotion ${promotion.id} target enrollment is not active`)
        }
      }
      if (promotion.fromProgramYear.programId !== promotion.fromProgramId) {
        criticalErrors.push(`Promotion ${promotion.id} source year does not belong to source program`)
      }
      if (promotion.toProgramYear.programId !== promotion.toProgramId) {
        criticalErrors.push(`Promotion ${promotion.id} target year does not belong to target program`)
      }
      if (promotion.toProgram.durationYears < promotion.toProgramYear.yearNumber) {
        criticalErrors.push(`Promotion ${promotion.id} exceeds program duration`)
      }
      const duplicateKey = [
        promotion.studentId,
        promotion.fromEnrollmentId,
        promotion.toEnrollmentId ?? 'missing',
        promotion.fromProgramSemesterId ?? 'none',
        promotion.toProgramSemesterId ?? 'none',
      ].join(':')
      if (promotionKeys.has(duplicateKey)) {
        criticalErrors.push(`Promotion ${promotion.id} duplicates an existing transition`)
      }
      promotionKeys.add(duplicateKey)
      const matchingHistory = histories.find((item) =>
        item.studentId === promotion.studentId &&
        item.eventType === StudentAcademicHistoryEventType.PROMOTION &&
        item.occurredAt.getTime() === promotion.promotedAt.getTime(),
      )
      if (!matchingHistory) {
        criticalErrors.push(`Promotion ${promotion.id} is missing a matching PROMOTION history entry`)
      } else if (matchingHistory.enrollmentId === promotion.fromEnrollmentId && matchingHistory.enrollmentId !== promotion.toEnrollmentId) {
        acceptedExceptions.push(`Promotion ${promotion.id} history is attached to the source enrollment record instead of the target enrollment record`)
      }
      if (promotion.manualOverride) {
        if (!promotion.overrideReason?.trim()) {
          criticalErrors.push(`Override promotion ${promotion.id} is missing an override reason`)
        }
        const overrideAudit = activityLogs.find((item) => item.action === 'STUDENT_PROMOTION_OVERRIDE' && typeof item.details === 'string' && item.details.includes(promotion.id))
        if (!overrideAudit) {
          criticalErrors.push(`Override promotion ${promotion.id} is missing an override audit log`)
        }
      }
    }

    for (const transfer of transfers) {
      note(totals, 'Transfer')
      if (transfer.fromEnrollment.studentId !== transfer.studentId) {
        criticalErrors.push(`Transfer ${transfer.id} source enrollment student mismatch`)
      }
      if (!transfer.toEnrollment) {
        criticalErrors.push(`Transfer ${transfer.id} is missing its target enrollment`)
      } else {
        if (transfer.toEnrollment.studentId !== transfer.studentId) {
          criticalErrors.push(`Transfer ${transfer.id} target enrollment student mismatch`)
        }
        if (!transfer.toEnrollment.isActive || transfer.toEnrollment.status !== StudentEnrollmentStatus.ACTIVE) {
          criticalErrors.push(`Transfer ${transfer.id} target enrollment is not active`)
        }
      }
      if (transfer.fromEnrollment.isActive || transfer.fromEnrollment.status !== StudentEnrollmentStatus.TRANSFERRED) {
        criticalErrors.push(`Transfer ${transfer.id} source enrollment was not closed correctly`)
      }
      if (
        transfer.fromDepartmentId === transfer.toDepartmentId &&
        transfer.fromProgramId === transfer.toProgramId &&
        transfer.fromGroupId === transfer.toGroupId
      ) {
        criticalErrors.push(`Transfer ${transfer.id} source and target contexts are identical`)
      }
      const historyType = transfer.transferType === 'GROUP'
        ? StudentAcademicHistoryEventType.GROUP_TRANSFER
        : transfer.transferType === 'DEPARTMENT'
          ? StudentAcademicHistoryEventType.DEPARTMENT_TRANSFER
          : StudentAcademicHistoryEventType.PROGRAM_TRANSFER
      const matchingHistory = histories.find((item) =>
        item.studentId === transfer.studentId &&
        item.eventType === historyType &&
        item.occurredAt.getTime() === transfer.transferredAt.getTime(),
      )
      if (!matchingHistory) {
        criticalErrors.push(`Transfer ${transfer.id} is missing a matching ${historyType} history entry`)
      } else if (matchingHistory.enrollmentId === transfer.fromEnrollmentId && matchingHistory.enrollmentId !== transfer.toEnrollmentId) {
        acceptedExceptions.push(`Transfer ${transfer.id} history is attached to the source enrollment record instead of the target enrollment record`)
      }
    }

    for (const leave of leaves) {
      note(totals, 'Leave')
      if (leave.enrollment.studentId !== leave.studentId) {
        criticalErrors.push(`Leave ${leave.id} enrollment student mismatch`)
      }
      if (leave.endsAt && leave.endsAt < leave.startsAt) {
        criticalErrors.push(`Leave ${leave.id} has an end date before its start date`)
      }
      if (leave.readmittedAt === null && leave.enrollment.status !== StudentEnrollmentStatus.LEAVE) {
        criticalErrors.push(`Open leave ${leave.id} does not match LEAVE enrollment state`)
      }
    }

    const openLeaveCounts = new Map<string, number>()
    for (const leave of leaves.filter((item) => item.readmittedAt === null)) {
      openLeaveCounts.set(leave.studentId, (openLeaveCounts.get(leave.studentId) ?? 0) + 1)
    }
    for (const [studentId, count] of openLeaveCounts.entries()) {
      if (count > 1) {
        criticalErrors.push(`Student ${studentId} has ${count} overlapping open leave records`)
      }
    }

    for (const history of histories.filter((item) => item.eventType === StudentAcademicHistoryEventType.READMISSION)) {
      note(totals, 'Readmission')
      const matchingLeave = leaves.find((item) => item.studentId === history.studentId && item.readmittedAt && item.readmittedAt.getTime() === history.occurredAt.getTime())
      const matchingEnrollment = enrollments.find((item) => item.id === history.enrollmentId)
      if (!matchingLeave && !matchingEnrollment) {
        criticalErrors.push(`Readmission history ${history.id} has no matching leave closure or enrollment`)
      } else if (matchingEnrollment && (!matchingEnrollment.isActive || matchingEnrollment.status !== StudentEnrollmentStatus.ACTIVE)) {
        acceptedExceptions.push(`Readmission history ${history.id} is attached to the prior inactive enrollment record instead of the reactivated enrollment record`)
      }
    }

    const certificateNumbers = new Set<string>()
    for (const graduation of graduations) {
      note(totals, 'Graduation')
      if (graduation.enrollment.studentId !== graduation.studentId) {
        criticalErrors.push(`Graduation ${graduation.id} enrollment student mismatch`)
      }
      if (graduation.certificateNumber) {
        if (certificateNumbers.has(graduation.certificateNumber)) {
          criticalErrors.push(`Duplicate graduation certificate number ${graduation.certificateNumber}`)
        }
        certificateNumbers.add(graduation.certificateNumber)
      }
      if (graduation.graduatedAt < graduation.enrollment.enrolledAt) {
        criticalErrors.push(`Graduation ${graduation.id} occurs before the enrollment start date`)
      }
      const matchingHistory = histories.find((item) => item.studentId === graduation.studentId && item.eventType === StudentAcademicHistoryEventType.GRADUATION)
      if (!matchingHistory) {
        criticalErrors.push(`Graduation ${graduation.id} is missing a GRADUATION history entry`)
      }
    }

    for (const student of students) {
      note(totals, 'Legacy')
      const activeEnrollment = student.enrollments.find((item) => item.status === StudentEnrollmentStatus.ACTIVE && item.isActive)
      if (activeEnrollment && student.subjects.length > 0) {
        const alignedSubjects = student.subjects.filter((item) => item.groupId === activeEnrollment.groupId && item.semesterId === activeEnrollment.semesterId)
        if (alignedSubjects.length === 0) {
          acceptedExceptions.push(`Student ${student.id} has active enrollment plus legacy subjects in a different scope; conflict is reported and must remain intentional/documented`)
        }
      }
      if (!activeEnrollment && student.subjects.length > 0 && student.enrollments.length === 0) {
        warnings.push(`Student ${student.id} is legacy-only and depends on StudentSubject fallback`)
      }
    }

    const reportLines = [
      '# Student Lifecycle Integrity Report',
      '',
      'Final result: ' + (criticalErrors.length === 0 ? 'PASS' : 'FAIL'),
      '',
      `Database URL suffix: _phase3_tests`,
      `Checked at: ${new Date().toISOString()}`,
      '',
      '## Totals',
      `- Students: ${students.length}`,
      `- Enrollments: ${enrollments.length}`,
      `- History entries: ${histories.length}`,
      `- Promotions: ${promotions.length}`,
      `- Transfers: ${transfers.length}`,
      `- Leaves: ${leaves.length}`,
      `- Graduations: ${graduations.length}`,
      `- StudentSubject rows: ${studentSubjects.length}`,
      '',
      '## Totals By Category',
      `- Enrollment checks: ${totals.Enrollment}`,
      `- History checks: ${totals.History}`,
      `- Promotion checks: ${totals.Promotion}`,
      `- Transfer checks: ${totals.Transfer}`,
      `- Leave checks: ${totals.Leave}`,
      `- Readmission checks: ${totals.Readmission}`,
      `- Graduation checks: ${totals.Graduation}`,
      `- Legacy checks: ${totals.Legacy}`,
      '',
      '## Critical Errors',
      ...(criticalErrors.length > 0 ? criticalErrors.map((item) => `- ${item}`) : ['- None']),
      '',
      '## Warnings',
      ...(warnings.length > 0 ? warnings.map((item) => `- ${item}`) : ['- None']),
      '',
      '## Accepted Exceptions',
      ...(acceptedExceptions.length > 0 ? acceptedExceptions.map((item) => `- ${item}`) : ['- None']),
    ]

    const outputDir = path.join(process.cwd(), 'docs', 'phase-3')
    await mkdir(outputDir, { recursive: true })
    await writeFile(path.join(outputDir, 'STUDENT_LIFECYCLE_INTEGRITY_REPORT.md'), reportLines.join('\n'))

    console.log(reportLines.join('\n'))

    if (criticalErrors.length > 0) {
      process.exit(1)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
