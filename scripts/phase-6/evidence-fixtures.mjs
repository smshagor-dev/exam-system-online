import { PrismaClient, QuestionType, ResultMode, TranslationStatus } from '@prisma/client'
import { ensurePhase5EvidenceFixtures, closeFixturesPrisma } from '../phase-5/evidence-fixtures.mjs'

const prisma = new PrismaClient()

async function cleanupPhase6Records() {
  for (let pass = 0; pass < 5; pass += 1) {
    const exams = await prisma.exam.findMany({
      where: { title: { startsWith: 'P6 Evidence' } },
      select: { id: true },
    })
    const examIds = exams.map((item) => item.id)
    const attempts = await prisma.studentExamAttempt.findMany({
      where: { examId: { in: examIds } },
      select: { id: true },
    })
    const attemptIds = attempts.map((item) => item.id)

    if (attemptIds.length > 0) {
      await prisma.examResult.deleteMany({ where: { attemptId: { in: attemptIds } } })
      await prisma.examResult.deleteMany({ where: { examId: { in: examIds } } })
      await prisma.studentAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } })
      await prisma.examAttemptSnapshot.deleteMany({ where: { attemptId: { in: attemptIds } } })
      await prisma.activityLog.deleteMany({
        where: {
          OR: [
            { examId: { in: examIds } },
            {
              details: {
                in: attemptIds.map((attemptId) => `"attemptId":"${attemptId}"`),
              },
            },
          ],
        },
      }).catch(() => {})
      await prisma.studentExamAttempt.deleteMany({ where: { id: { in: attemptIds } } })
      await prisma.studentExamAttempt.deleteMany({ where: { examId: { in: examIds } } })
    }

    if (examIds.length === 0) {
      break
    }

    try {
      await prisma.examQuestion.deleteMany({ where: { examId: { in: examIds } } })
      await prisma.examSession.deleteMany({ where: { examId: { in: examIds } } })
      await prisma.examTranslation.deleteMany({ where: { examId: { in: examIds } } })
      await prisma.examResult.deleteMany({ where: { examId: { in: examIds } } })
      await prisma.exam.deleteMany({ where: { id: { in: examIds } } })
      break
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (
        (
          !message.includes('ExamToExamResult') &&
          !message.includes('ExamToStudentExamAttempt')
        ) ||
        pass === 4
      ) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (pass + 1)))
    }
  }

  const questions = await prisma.question.findMany({
    where: { text: { startsWith: 'P6 Evidence' } },
    select: { id: true },
  })
  const questionIds = questions.map((item) => item.id)
  if (questionIds.length > 0) {
    const optionIds = (
      await prisma.questionOption.findMany({
        where: { questionId: { in: questionIds } },
        select: { id: true },
      })
    ).map((item) => item.id)

    if (optionIds.length > 0) {
      await prisma.questionOptionTranslation.deleteMany({
        where: { questionOptionId: { in: optionIds } },
      })
      await prisma.questionOption.deleteMany({
        where: { id: { in: optionIds } },
      })
    }

    await prisma.questionTranslation.deleteMany({ where: { questionId: { in: questionIds } } })
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } })
  }
}

async function createQuestion({
  teacherId,
  subjectId,
  languageId,
  groupId,
  academicYearId,
  semesterId,
  academicOfferingId,
  text,
}) {
  const question = await prisma.question.create({
    data: {
      teacherId,
      subjectId,
      languageId,
      groupId,
      academicYearId,
      semesterId,
      academicOfferingId,
      type: QuestionType.MCQ,
      text,
      marks: 5,
      difficulty: 'medium',
      options: {
        create: [
          { text: `${text} Option A`, isCorrect: true, orderIndex: 0 },
          { text: `${text} Option B`, isCorrect: false, orderIndex: 1 },
          { text: `${text} Option C`, isCorrect: false, orderIndex: 2 },
        ],
      },
    },
    include: { options: { orderBy: { orderIndex: 'asc' } } },
  })

  await prisma.questionTranslation.create({
    data: {
      questionId: question.id,
      languageId,
      text,
      status: TranslationStatus.COMPLETE,
      completedAt: new Date(),
    },
  })
  await prisma.questionOptionTranslation.createMany({
    data: question.options.map((option) => ({
      questionOptionId: option.id,
      languageId,
      text: option.text,
      status: TranslationStatus.COMPLETE,
      completedAt: new Date(),
    })),
  })

  return question
}

async function createExam({
  teacherId,
  departmentId,
  subjectId,
  languageId,
  groupId,
  academicYearId,
  semesterId,
  academicOfferingId,
  title,
  instructions,
  duration,
  startOffsetSeconds,
  endOffsetSeconds,
  questionId,
}) {
  const now = Date.now()
  const exam = await prisma.exam.create({
    data: {
      title,
      teacherId,
      departmentId,
      subjectId,
      languageId,
      groupId,
      academicYearId,
      semesterId,
      academicOfferingId,
      questionType: QuestionType.MCQ,
      status: 'SCHEDULED',
      resultMode: ResultMode.AUTO,
      totalMarks: 5,
      passingMarks: 3,
      duration,
      startTime: new Date(now + startOffsetSeconds * 1000),
      endTime: new Date(now + endOffsetSeconds * 1000),
      instructions,
      questions: {
        create: [{ questionId, orderIndex: 0, marks: 5 }],
      },
    },
  })

  await prisma.examTranslation.create({
    data: {
      examId: exam.id,
      languageId,
      title,
      instructions,
      status: TranslationStatus.COMPLETE,
      completedAt: new Date(),
    },
  })

  return exam
}

export async function ensurePhase6EvidenceFixtures() {
  const phase5 = await ensurePhase5EvidenceFixtures()
  await cleanupPhase6Records()

  const englishStudent = await prisma.studentProfile.findUniqueOrThrow({
    where: { userId: phase5.ids.student.englishUserId },
  })
  const russianStudent = await prisma.studentProfile.findUniqueOrThrow({
    where: { userId: phase5.ids.student.russianUserId },
  })
  const leadTeacher = await prisma.teacherProfile.findUniqueOrThrow({
    where: { userId: phase5.ids.teacher.johnUserId },
  })

  const englishScope = await prisma.teacherAssignment.findUniqueOrThrow({
    where: {
      teacherId_subjectId_languageId_groupId_academicYearId_semesterId: {
        teacherId: leadTeacher.id,
        subjectId: (
          await prisma.teacherAssignment.findFirstOrThrow({
            where: { id: phase5.ids.scope.englishLegacyAssignmentId },
          })
        ).subjectId,
        languageId: (
          await prisma.teacherAssignment.findFirstOrThrow({
            where: { id: phase5.ids.scope.englishLegacyAssignmentId },
          })
        ).languageId,
        groupId: (
          await prisma.teacherAssignment.findFirstOrThrow({
            where: { id: phase5.ids.scope.englishLegacyAssignmentId },
          })
        ).groupId,
        academicYearId: (
          await prisma.teacherAssignment.findFirstOrThrow({
            where: { id: phase5.ids.scope.englishLegacyAssignmentId },
          })
        ).academicYearId,
        semesterId: (
          await prisma.teacherAssignment.findFirstOrThrow({
            where: { id: phase5.ids.scope.englishLegacyAssignmentId },
          })
        ).semesterId,
      },
    },
  })

  const russianScope = await prisma.teacherAssignment.findUniqueOrThrow({
    where: {
      teacherId_subjectId_languageId_groupId_academicYearId_semesterId: {
        teacherId: leadTeacher.id,
        subjectId: (
          await prisma.teacherAssignment.findFirstOrThrow({
            where: { id: phase5.ids.scope.russianLegacyAssignmentId },
          })
        ).subjectId,
        languageId: (
          await prisma.teacherAssignment.findFirstOrThrow({
            where: { id: phase5.ids.scope.russianLegacyAssignmentId },
          })
        ).languageId,
        groupId: (
          await prisma.teacherAssignment.findFirstOrThrow({
            where: { id: phase5.ids.scope.russianLegacyAssignmentId },
          })
        ).groupId,
        academicYearId: (
          await prisma.teacherAssignment.findFirstOrThrow({
            where: { id: phase5.ids.scope.russianLegacyAssignmentId },
          })
        ).academicYearId,
        semesterId: (
          await prisma.teacherAssignment.findFirstOrThrow({
            where: { id: phase5.ids.scope.russianLegacyAssignmentId },
          })
        ).semesterId,
      },
    },
  })

  const [manualQuestion, autoQuestion, loadQuestion] = await Promise.all([
    createQuestion({
      teacherId: leadTeacher.id,
      subjectId: englishScope.subjectId,
      languageId: englishScope.languageId,
      groupId: englishScope.groupId,
      academicYearId: englishScope.academicYearId,
      semesterId: englishScope.semesterId,
      academicOfferingId: englishScope.academicOfferingId,
      text: 'P6 Evidence Manual Question',
    }),
    createQuestion({
      teacherId: englishScope.teacherId,
      subjectId: englishScope.subjectId,
      languageId: englishScope.languageId,
      groupId: englishScope.groupId,
      academicYearId: englishScope.academicYearId,
      semesterId: englishScope.semesterId,
      academicOfferingId: englishScope.academicOfferingId,
      text: 'P6 Evidence Auto Question',
    }),
    createQuestion({
      teacherId: englishScope.teacherId,
      subjectId: englishScope.subjectId,
      languageId: englishScope.languageId,
      groupId: englishScope.groupId,
      academicYearId: englishScope.academicYearId,
      semesterId: englishScope.semesterId,
      academicOfferingId: englishScope.academicOfferingId,
      text: 'P6 Evidence Load Question',
    }),
  ])

  const [manualExam, autoExam, loadExam] = await Promise.all([
    createExam({
      teacherId: leadTeacher.id,
      departmentId: phase5.ids.department.cse,
      subjectId: englishScope.subjectId,
      languageId: englishScope.languageId,
      groupId: englishScope.groupId,
      academicYearId: englishScope.academicYearId,
      semesterId: englishScope.semesterId,
      academicOfferingId: englishScope.academicOfferingId,
      title: 'P6 Evidence Manual Exam',
      instructions: 'P6 manual reconnect and submit exam',
      duration: 20,
      startOffsetSeconds: -300,
      endOffsetSeconds: 1800,
      questionId: manualQuestion.id,
    }),
    createExam({
      teacherId: leadTeacher.id,
      departmentId: phase5.ids.department.cse,
      subjectId: englishScope.subjectId,
      languageId: englishScope.languageId,
      groupId: englishScope.groupId,
      academicYearId: englishScope.academicYearId,
      semesterId: englishScope.semesterId,
      academicOfferingId: englishScope.academicOfferingId,
      title: 'P6 Evidence Auto Exam',
      instructions: 'P6 auto submit exam',
      duration: 1,
      startOffsetSeconds: -30,
      endOffsetSeconds: 600,
      questionId: autoQuestion.id,
    }),
    createExam({
      teacherId: leadTeacher.id,
      departmentId: phase5.ids.department.cse,
      subjectId: englishScope.subjectId,
      languageId: englishScope.languageId,
      groupId: englishScope.groupId,
      academicYearId: englishScope.academicYearId,
      semesterId: englishScope.semesterId,
      academicOfferingId: englishScope.academicOfferingId,
      title: 'P6 Evidence Load Exam',
      instructions: 'P6 load and storm exam',
      duration: 30,
      startOffsetSeconds: -120,
      endOffsetSeconds: 3600,
      questionId: loadQuestion.id,
    }),
  ])

  return {
    ...phase5,
    ids: {
      ...phase5.ids,
      phase6: {
        manualExam: manualExam.id,
        autoExam: autoExam.id,
        loadExam: loadExam.id,
        manualQuestion: manualQuestion.id,
        autoQuestion: autoQuestion.id,
        loadQuestion: loadQuestion.id,
        englishStudentId: englishStudent.id,
        russianStudentId: russianStudent.id,
        russianExam: phase5.ids.exam.russian,
      },
    },
    scopes: {
      english: englishScope,
      russian: russianScope,
    },
  }
}

export async function closePhase6FixturesPrisma() {
  await prisma.$disconnect().catch(() => {})
  await closeFixturesPrisma().catch(() => {})
}
