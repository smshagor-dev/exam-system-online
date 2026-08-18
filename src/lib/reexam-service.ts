import { randomUUID } from 'node:crypto'
import { prisma } from './prisma'
import {
  createReExamRecord,
  findActiveReExamRequest,
  getReExamRecord,
  getReExamTargetForExam,
  updateReExamRecord,
  type ReExamRecord,
  type ReExamType,
} from './reexam-store'

function reExamLabel(type: ReExamType) {
  switch (type) {
    case 'SUPPLEMENTARY':
      return 'Supplementary Exam'
    case 'IMPROVEMENT':
      return 'Improvement Exam'
    case 'BACKLOG':
      return 'Backlog Exam'
    default:
      return 'Re-exam'
  }
}

async function loadOriginalExam(originalExamId: string) {
  return prisma.exam.findUnique({
    where: { id: originalExamId },
    include: {
      teacher: {
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
      subject: { select: { name: true } },
      questions: {
        select: {
          questionId: true,
          orderIndex: true,
          marks: true,
        },
        orderBy: { orderIndex: 'asc' },
      },
      translations: true,
    },
  })
}

async function loadStudentForOriginalExam(studentId: string, originalExam: NonNullable<Awaited<ReturnType<typeof loadOriginalExam>>>) {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      userId: true,
      departmentId: true,
      user: { select: { id: true, name: true, email: true } },
      subjects: {
        where: originalExam.academicOfferingId
          ? {
              OR: [
                { academicOfferingId: originalExam.academicOfferingId },
                {
                  subjectId: originalExam.subjectId,
                  languageId: originalExam.languageId,
                  groupId: originalExam.groupId,
                  academicYearId: originalExam.academicYearId,
                  semesterId: originalExam.semesterId,
                },
              ],
            }
          : {
              subjectId: originalExam.subjectId,
              languageId: originalExam.languageId,
              groupId: originalExam.groupId,
              academicYearId: originalExam.academicYearId,
              semesterId: originalExam.semesterId,
            },
        select: { id: true },
        take: 1,
      },
      examAttempts: {
        where: { examId: originalExam.id },
        select: { id: true },
        take: 1,
      },
    },
  })

  if (!student) throw new Error('Student profile not found')
  if (student.departmentId !== originalExam.departmentId) {
    throw new Error('Student does not belong to the exam department')
  }
  if (student.subjects.length === 0 && student.examAttempts.length === 0) {
    throw new Error('Student was not enrolled in this exam scope')
  }

  return student
}

async function loadStudentByUserForOriginalExam(
  studentUserId: string,
  originalExam: NonNullable<Awaited<ReturnType<typeof loadOriginalExam>>>
) {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: studentUserId },
    select: { id: true },
  })
  if (!profile) throw new Error('Student profile not found')
  return loadStudentForOriginalExam(profile.id, originalExam)
}

function assertOriginalExamCanBeRequested(originalExam: NonNullable<Awaited<ReturnType<typeof loadOriginalExam>>>) {
  const isFinished =
    originalExam.endTime <= new Date() ||
    originalExam.status === 'COMPLETED' ||
    originalExam.status === 'RESULT_PUBLISHED'

  if (!isFinished) {
    throw new Error('Re-exam can only be requested after the original exam has ended')
  }
}

async function assertNotReExam(originalExamId: string) {
  const parentAssignment = await getReExamTargetForExam(originalExamId)
  if (parentAssignment) {
    throw new Error('A re-exam cannot be used as the source of another re-exam')
  }
}

async function createDraftReExam(input: {
  reExamId: string
  originalExam: NonNullable<Awaited<ReturnType<typeof loadOriginalExam>>>
  teacherId: string
  type: ReExamType
}) {
  const existing = await prisma.exam.findUnique({ where: { id: input.reExamId }, select: { id: true } })
  if (existing) return existing

  const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const endTime = new Date(startTime.getTime() + input.originalExam.duration * 60 * 1000)
  const label = reExamLabel(input.type)

  return prisma.exam.create({
    data: {
      id: input.reExamId,
      title: `${input.originalExam.title} — ${label}`,
      description: input.originalExam.description,
      teacherId: input.teacherId,
      departmentId: input.originalExam.departmentId,
      subjectId: input.originalExam.subjectId,
      languageId: input.originalExam.languageId,
      groupId: input.originalExam.groupId,
      academicYearId: input.originalExam.academicYearId,
      semesterId: input.originalExam.semesterId,
      academicOfferingId: input.originalExam.academicOfferingId,
      questionType: input.originalExam.questionType,
      status: 'DRAFT',
      resultMode: input.originalExam.resultMode,
      totalMarks: input.originalExam.totalMarks,
      passingMarks: input.originalExam.passingMarks,
      duration: input.originalExam.duration,
      startTime,
      endTime,
      autoPublish: false,
      allowRetake: false,
      showAnswers: input.originalExam.showAnswers,
      showMarks: input.originalExam.showMarks,
      instructions: input.originalExam.instructions,
      questions: {
        create: input.originalExam.questions.map((question) => ({
          questionId: question.questionId,
          orderIndex: question.orderIndex,
          marks: question.marks,
        })),
      },
      translations: {
        create: input.originalExam.translations.map((translation) => ({
          languageId: translation.languageId,
          title: `${translation.title} — ${label}`,
          description: translation.description,
          instructions: translation.instructions,
          status: translation.status,
          completedAt: translation.completedAt,
          archivedAt: null,
        })),
      },
    },
    select: { id: true },
  })
}

async function notify(input: {
  userId: string
  title: string
  message: string
  link: string
  type?: string
}) {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      message: input.message,
      link: input.link,
      type: input.type ?? 'info',
    },
  })
}

async function logAction(input: {
  userId: string
  action: string
  examId: string
  details: Record<string, unknown>
}) {
  await prisma.activityLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      examId: input.examId,
      details: JSON.stringify(input.details),
    },
  })
}

export async function requestReExam(input: {
  studentUserId: string
  originalExamId: string
  reason: string
  type: ReExamType
}) {
  const originalExam = await loadOriginalExam(input.originalExamId)
  if (!originalExam) throw new Error('Original exam not found')
  assertOriginalExamCanBeRequested(originalExam)
  await assertNotReExam(originalExam.id)

  const student = await loadStudentByUserForOriginalExam(input.studentUserId, originalExam)
  const active = await findActiveReExamRequest(originalExam.id, student.id)
  if (active) {
    throw new Error(active.status === 'APPROVED' ? 'Re-exam is already enabled' : 'A re-exam request is already pending')
  }

  const record = await createReExamRecord({
    originalExamId: originalExam.id,
    studentId: student.id,
    studentUserId: student.userId,
    teacherId: originalExam.teacherId,
    teacherUserId: originalExam.teacher.user.id,
    reason: input.reason.trim(),
    type: input.type,
    source: 'STUDENT_REQUEST',
    status: 'PENDING',
  })

  await Promise.all([
    notify({
      userId: originalExam.teacher.user.id,
      title: 'New Re-exam Request',
      message: `${student.user.name} requested ${reExamLabel(input.type).toLowerCase()} for ${originalExam.title}.`,
      link: '/teacher/re-exams',
      type: 'warning',
    }),
    logAction({
      userId: student.userId,
      action: 'REEXAM_REQUESTED',
      examId: originalExam.id,
      details: { requestId: record.id, type: input.type, reason: input.reason.trim() },
    }),
  ])

  return record
}

async function finalizeApproval(input: {
  record: ReExamRecord
  teacherUserId: string
  teacherResponse?: string | null
}) {
  if (input.record.teacherUserId !== input.teacherUserId) {
    throw new Error('This re-exam request belongs to another teacher')
  }
  if (input.record.status === 'REJECTED' || input.record.status === 'CANCELLED') {
    throw new Error(`This request is already ${input.record.status.toLowerCase()}`)
  }
  if (input.record.status === 'APPROVED' && input.record.reExamId) {
    return input.record
  }

  const originalExam = await loadOriginalExam(input.record.originalExamId)
  if (!originalExam) throw new Error('Original exam not found')
  await assertNotReExam(originalExam.id)
  const student = await loadStudentForOriginalExam(input.record.studentId, originalExam)

  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId: input.teacherUserId },
    select: { id: true, userId: true },
  })
  if (!teacher) throw new Error('Teacher profile not found')

  const reExamId = input.record.reExamId ?? randomUUID()
  if (!input.record.reExamId) {
    await updateReExamRecord(input.record.id, { reExamId })
  }

  await createDraftReExam({
    reExamId,
    originalExam,
    teacherId: teacher.id,
    type: input.record.type,
  })

  const decidedAt = new Date().toISOString()
  const approved = await updateReExamRecord(input.record.id, {
    reExamId,
    status: 'APPROVED',
    teacherResponse: input.teacherResponse?.trim() || null,
    decidedAt,
  })
  if (!approved) throw new Error('Failed to update re-exam request')

  await Promise.all([
    notify({
      userId: student.userId,
      title: input.record.source === 'TEACHER_MANUAL' ? 'Re-exam Enabled' : 'Re-exam Request Approved',
      message: `${reExamLabel(input.record.type)} for ${originalExam.title} has been enabled. The teacher will publish the schedule after setup.`,
      link: '/student/re-exams',
      type: 'success',
    }),
    logAction({
      userId: input.teacherUserId,
      action: input.record.source === 'TEACHER_MANUAL' ? 'REEXAM_MANUAL_ENABLED' : 'REEXAM_APPROVED',
      examId: originalExam.id,
      details: {
        requestId: input.record.id,
        reExamId,
        studentId: student.id,
        type: input.record.type,
      },
    }),
  ])

  return approved
}

export async function approveReExamRequest(input: {
  teacherUserId: string
  requestId: string
  teacherResponse?: string | null
}) {
  const record = await getReExamRecord(input.requestId)
  if (!record) throw new Error('Re-exam request not found')
  return finalizeApproval({
    record,
    teacherUserId: input.teacherUserId,
    teacherResponse: input.teacherResponse,
  })
}

export async function rejectReExamRequest(input: {
  teacherUserId: string
  requestId: string
  teacherResponse?: string | null
}) {
  const record = await getReExamRecord(input.requestId)
  if (!record) throw new Error('Re-exam request not found')
  if (record.teacherUserId !== input.teacherUserId) {
    throw new Error('This re-exam request belongs to another teacher')
  }
  if (record.status !== 'PENDING') {
    throw new Error(`Only pending requests can be rejected; current status is ${record.status}`)
  }

  const originalExam = await loadOriginalExam(record.originalExamId)
  const rejected = await updateReExamRecord(record.id, {
    status: 'REJECTED',
    teacherResponse: input.teacherResponse?.trim() || null,
    decidedAt: new Date().toISOString(),
  })
  if (!rejected) throw new Error('Failed to reject re-exam request')

  await Promise.all([
    notify({
      userId: record.studentUserId,
      title: 'Re-exam Request Rejected',
      message: originalExam
        ? `Your re-exam request for ${originalExam.title} was not approved.`
        : 'Your re-exam request was not approved.',
      link: '/student/re-exams',
      type: 'warning',
    }),
    logAction({
      userId: input.teacherUserId,
      action: 'REEXAM_REJECTED',
      examId: record.originalExamId,
      details: {
        requestId: record.id,
        studentId: record.studentId,
        response: input.teacherResponse?.trim() || null,
      },
    }),
  ])

  return rejected
}

export async function enableReExamManually(input: {
  teacherUserId: string
  originalExamId: string
  studentId: string
  reason: string
  type: ReExamType
}) {
  const originalExam = await loadOriginalExam(input.originalExamId)
  if (!originalExam) throw new Error('Original exam not found')
  assertOriginalExamCanBeRequested(originalExam)
  await assertNotReExam(originalExam.id)

  const teacher = await prisma.teacherProfile.findUnique({
    where: { userId: input.teacherUserId },
    select: { id: true, userId: true },
  })
  if (!teacher) throw new Error('Teacher profile not found')

  const student = await loadStudentForOriginalExam(input.studentId, originalExam)
  const active = await findActiveReExamRequest(originalExam.id, student.id)
  if (active?.status === 'APPROVED') {
    throw new Error('Re-exam is already enabled for this student')
  }

  if (active?.status === 'PENDING') {
    return finalizeApproval({
      record: active,
      teacherUserId: input.teacherUserId,
      teacherResponse: input.reason.trim() || 'Enabled manually by teacher',
    })
  }

  const record = await createReExamRecord({
    originalExamId: originalExam.id,
    reExamId: randomUUID(),
    studentId: student.id,
    studentUserId: student.userId,
    teacherId: teacher.id,
    teacherUserId: teacher.userId,
    reason: input.reason.trim() || 'Enabled manually by teacher',
    type: input.type,
    source: 'TEACHER_MANUAL',
    status: 'PENDING',
  })

  return finalizeApproval({
    record,
    teacherUserId: input.teacherUserId,
    teacherResponse: input.reason.trim() || 'Enabled manually by teacher',
  })
}
