const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const PROMOTION_JOB_KEY = 'student-academic-promotion-job'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const ACADEMIC_ARCHITECTURE_V2_ENABLED = process.env.ACADEMIC_ARCHITECTURE_V2 === 'true'
const COURSE_DURATIONS = {
  BACHELOR_OF_SCIENCE: 4,
  MASTER_OF_SCIENCE: 2,
}

let schedulerStarted = false
let schedulerInterval = null

function getPromotionTimeZone() {
  return process.env.ACADEMIC_PROMOTION_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function getDatePartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })

  const parts = formatter.formatToParts(date)
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
  }
}

function normalizeCourse(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') return null

  const normalized = rawValue.trim().toUpperCase()
  if (normalized === 'BACHELOR_OF_SCIENCE' || normalized === 'BSC' || normalized === 'BACHELOR OF SCIENCE') {
    return 'BACHELOR_OF_SCIENCE'
  }
  if (normalized === 'MASTER_OF_SCIENCE' || normalized === 'MSC' || normalized === 'MASTER OF SCIENCE') {
    return 'MASTER_OF_SCIENCE'
  }

  return null
}

function getCourseDuration(course) {
  return course ? COURSE_DURATIONS[course] || null : null
}

function getCourseFromProfile(profile) {
  const responses = profile && typeof profile.customFieldResponses === 'object' ? profile.customFieldResponses : null
  if (!responses || Array.isArray(responses)) return null
  return normalizeCourse(responses.course)
}

function buildTargetGroupMap(groups) {
  const groupsByYear = new Map()

  for (const group of groups) {
    if (!group.academicYearId) continue
    const list = groupsByYear.get(group.academicYearId) || []
    list.push(group)
    groupsByYear.set(group.academicYearId, list)
  }

  return groupsByYear
}

function resolveNextGroupId(studentSubject, nextAcademicYearId, groupsByYear) {
  if (!studentSubject.group?.academicYearId || studentSubject.group.academicYearId === nextAcademicYearId) {
    return studentSubject.groupId
  }

  const candidates = groupsByYear.get(nextAcademicYearId) || []
  const matchedGroup =
    candidates.find((group) => group.code === studentSubject.group.code) ||
    candidates.find((group) => group.name === studentSubject.group.name)

  return matchedGroup ? matchedGroup.id : null
}

async function hasAlreadyRunForYear(year) {
  const state = await prisma.systemSetting.findUnique({
    where: { key: PROMOTION_JOB_KEY },
    select: { footerText: true },
  })

  return state?.footerText === String(year)
}

async function markRunComplete(year, stats, timeZone) {
  await prisma.systemSetting.upsert({
    where: { key: PROMOTION_JOB_KEY },
    update: {
      footerText: String(year),
      systemDescription: JSON.stringify({ ...stats, year, timeZone, completedAt: new Date().toISOString() }),
    },
    create: {
      key: PROMOTION_JOB_KEY,
      systemName: 'Student Academic Promotion Job',
      systemShortName: 'PromotionJob',
      footerText: String(year),
      systemDescription: JSON.stringify({ ...stats, year, timeZone, completedAt: new Date().toISOString() }),
      requireEmailVerification: true,
    },
  })
}

async function promoteStudentSubjects(student, academicYearByNumber, groupsByYear, stats) {
  for (const studentSubject of student.subjects) {
    const currentYearNumber = studentSubject.academicYear?.year
    if (!currentYearNumber) {
      stats.skippedSubjects += 1
      continue
    }

    const nextAcademicYear = academicYearByNumber.get(currentYearNumber + 1)
    if (!nextAcademicYear) {
      stats.skippedSubjects += 1
      continue
    }

    const nextGroupId = resolveNextGroupId(studentSubject, nextAcademicYear.id, groupsByYear)
    if (!nextGroupId) {
      stats.skippedSubjects += 1
      continue
    }

    const duplicateTarget = await prisma.studentSubject.findFirst({
      where: {
        studentId: student.id,
        subjectId: studentSubject.subjectId,
        languageId: studentSubject.languageId,
        groupId: nextGroupId,
        academicYearId: nextAcademicYear.id,
        semesterId: studentSubject.semesterId,
      },
      select: { id: true },
    })

    if (duplicateTarget) {
      await prisma.studentSubject.delete({ where: { id: studentSubject.id } })
      stats.mergedSubjects += 1
      continue
    }

    await prisma.studentSubject.update({
      where: { id: studentSubject.id },
      data: {
        academicYearId: nextAcademicYear.id,
        groupId: nextGroupId,
      },
    })
    stats.promotedSubjects += 1
  }
}

async function blockStudentAccess(student, duration, stats) {
  if (!student.user.isActive) {
    stats.alreadyInactiveStudents += 1
    return
  }

  await prisma.user.update({
    where: { id: student.userId },
    data: { isActive: false },
  })

  stats.blockedStudents += 1

  if (student.user.id) {
    await prisma.notification.create({
      data: {
        userId: student.user.id,
        title: 'Student access closed',
        message: `Your ${duration}-year program limit has been reached. Please contact your department for the next step.`,
        type: 'warning',
        link: '/login',
      },
    }).catch(() => {})
  }
}

async function runStudentPromotionIfDue(logger = console) {
  if (ACADEMIC_ARCHITECTURE_V2_ENABLED) {
    logger.warn('[Academic Promotion] Academic architecture v2 flag is enabled, but legacy promotion remains active until Phase 3 enrollment migration is complete.')
  }

  const now = new Date()
  const timeZone = getPromotionTimeZone()
  const { year, month } = getDatePartsInTimeZone(now, timeZone)

  const isBeforePromotionWindow = month < 9
  if (isBeforePromotionWindow) {
    return { status: 'skipped', reason: 'before_promotion_window', year, timeZone }
  }

  if (await hasAlreadyRunForYear(year)) {
    return { status: 'skipped', reason: 'already_completed', year, timeZone }
  }

  const [academicYears, groups, students] = await Promise.all([
    prisma.academicYear.findMany({
      where: { isActive: true },
      select: { id: true, year: true },
    }),
    prisma.group.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true, academicYearId: true },
    }),
    prisma.studentProfile.findMany({
      include: {
        user: {
          select: { id: true, isActive: true },
        },
        subjects: {
          include: {
            academicYear: { select: { id: true, year: true } },
            group: { select: { id: true, name: true, code: true, academicYearId: true } },
          },
        },
      },
    }),
  ])

  const academicYearByNumber = new Map(academicYears.map((item) => [item.year, item]))
  const groupsByYear = buildTargetGroupMap(groups)
  const stats = {
    processedStudents: 0,
    promotedStudents: 0,
    blockedStudents: 0,
    alreadyInactiveStudents: 0,
    skippedStudents: 0,
    promotedSubjects: 0,
    mergedSubjects: 0,
    skippedSubjects: 0,
  }

  for (const student of students) {
    stats.processedStudents += 1

    const course = getCourseFromProfile(student)
    const duration = getCourseDuration(course)
    if (!duration || student.subjects.length === 0) {
      stats.skippedStudents += 1
      continue
    }

    const hasReachedLimit = student.subjects.some((studentSubject) => {
      const currentYearNumber = studentSubject.academicYear?.year
      return typeof currentYearNumber === 'number' && currentYearNumber >= duration
    })

    if (hasReachedLimit) {
      await blockStudentAccess(student, duration, stats)
      continue
    }

    const promotedBefore = stats.promotedSubjects
    const mergedBefore = stats.mergedSubjects
    await promoteStudentSubjects(student, academicYearByNumber, groupsByYear, stats)

    if (stats.promotedSubjects > promotedBefore || stats.mergedSubjects > mergedBefore) {
      stats.promotedStudents += 1
    }
  }

  await markRunComplete(year, stats, timeZone)
  logger.log('[Academic Promotion] Completed yearly student promotion job:', {
    ...stats,
    year,
    timeZone,
  })

  return { status: 'completed', year, timeZone, ...stats }
}

function initStudentPromotionCron(logger = console) {
  if (schedulerStarted) return
  schedulerStarted = true

  runStudentPromotionIfDue(logger).catch((error) => {
    logger.error('[Academic Promotion] Initial run failed:', error)
  })

  schedulerInterval = setInterval(() => {
    runStudentPromotionIfDue(logger).catch((error) => {
      logger.error('[Academic Promotion] Scheduled run failed:', error)
    })
  }, CHECK_INTERVAL_MS)
}

async function stopStudentPromotionCron() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
  }

  schedulerStarted = false
  await prisma.$disconnect().catch(() => {})
}

module.exports = {
  initStudentPromotionCron,
  runStudentPromotionIfDue,
  stopStudentPromotionCron,
}
