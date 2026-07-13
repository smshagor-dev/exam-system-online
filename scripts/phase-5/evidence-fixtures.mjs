import fs from 'fs/promises'
import path from 'path'
import bcrypt from 'bcryptjs'
import {
  PrismaClient,
  QuestionType,
  ResultMode,
  TeachingAssignmentRoleType,
  TeachingAssignmentStatus,
  TranslationStatus,
  UserRole,
} from '@prisma/client'

const prisma = new PrismaClient()

const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 96 Td (P5 Evidence PDF) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000010 00000 n \n0000000063 00000 n \n0000000122 00000 n \n0000000192 00000 n \ntrailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n286\n%%EOF\n',
  'utf8'
)

function hash(password) {
  return bcrypt.hashSync(password, 12)
}

async function ensureUser({ email, name, role, password }) {
  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      role,
      password: hash(password),
      isActive: true,
      isEmailVerified: true,
    },
    create: {
      email,
      name,
      role,
      password: hash(password),
      isActive: true,
      isEmailVerified: true,
    },
  })
}

async function ensureTeacherProfile(userId, departmentId) {
  return prisma.teacherProfile.upsert({
    where: { userId },
    update: { departmentId },
    create: { userId, departmentId },
  })
}

async function ensureStudentProfile(userId, departmentId) {
  return prisma.studentProfile.upsert({
    where: { userId },
    update: { departmentId },
    create: { userId, departmentId },
  })
}

async function ensureMembership(teacherId, departmentId, role = 'Teacher') {
  return prisma.teacherDepartmentMembership.upsert({
    where: { teacherId_departmentId: { teacherId, departmentId } },
    update: { isActive: true, isPrimary: true, role },
    create: { teacherId, departmentId, isActive: true, isPrimary: true, role },
  })
}

async function ensureTeachingAssignment({
  teacherId,
  membershipId,
  departmentId,
  academicOfferingId,
  approvedById,
  notes,
  roles,
  isPrimary = false,
}) {
  const existing = await prisma.teachingAssignment.findFirst({
    where: { teacherId, academicOfferingId, notes },
    include: { roles: true },
  })

  const assignment = existing
    ? await prisma.teachingAssignment.update({
        where: { id: existing.id },
        data: {
          membershipId,
          departmentId,
          status: TeachingAssignmentStatus.ACTIVE,
          isPrimary,
          approvedById,
          approvedAt: new Date(),
          weeklyHours: 4,
          lectureHours: 2,
          labHours: 1,
          consultationHours: 0.5,
          assessmentHours: 0.5,
          notes,
        },
      })
    : await prisma.teachingAssignment.create({
        data: {
          teacherId,
          membershipId,
          departmentId,
          academicOfferingId,
          status: TeachingAssignmentStatus.ACTIVE,
          isPrimary,
          approvedById,
          approvedAt: new Date(),
          weeklyHours: 4,
          lectureHours: 2,
          labHours: 1,
          consultationHours: 0.5,
          assessmentHours: 0.5,
          notes,
        },
      })

  await prisma.teachingAssignmentRole.deleteMany({
    where: { teachingAssignmentId: assignment.id },
  })

  for (const [index, role] of roles.entries()) {
    await prisma.teachingAssignmentRole.create({
      data: {
        teachingAssignmentId: assignment.id,
        role,
        isPrimary: index === 0,
      },
    })
  }

  return prisma.teachingAssignment.findUniqueOrThrow({
    where: { id: assignment.id },
    include: { roles: true, academicOffering: true },
  })
}

async function ensureLegacyAssignment({
  teacherId,
  departmentId,
  subjectId,
  languageId,
  groupId,
  academicYearId,
  semesterId,
  academicOfferingId = null,
}) {
  return prisma.teacherAssignment.upsert({
    where: {
      teacherId_subjectId_languageId_groupId_academicYearId_semesterId: {
        teacherId,
        subjectId,
        languageId,
        groupId,
        academicYearId,
        semesterId,
      },
    },
    update: {
      departmentId,
      academicOfferingId,
    },
    create: {
      teacherId,
      departmentId,
      subjectId,
      languageId,
      groupId,
      academicYearId,
      semesterId,
      academicOfferingId,
    },
  })
}

async function ensureStudentSubject({
  studentId,
  subjectId,
  languageId,
  groupId,
  academicYearId,
  semesterId,
  academicOfferingId = null,
}) {
  return prisma.studentSubject.upsert({
    where: {
      studentId_subjectId_languageId_groupId_academicYearId_semesterId: {
        studentId,
        subjectId,
        languageId,
        groupId,
        academicYearId,
        semesterId,
      },
    },
    update: { academicOfferingId },
    create: {
      studentId,
      subjectId,
      languageId,
      groupId,
      academicYearId,
      semesterId,
      academicOfferingId,
    },
  })
}

async function ensurePdfFile(fileName) {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'ebooks')
  await fs.mkdir(uploadDir, { recursive: true })
  const filePath = path.join(uploadDir, fileName)
  await fs.writeFile(filePath, PDF_BYTES)
  return {
    fileName,
    filePath,
    fileUrl: `/uploads/ebooks/${fileName}`,
    fileSizeBytes: PDF_BYTES.byteLength,
  }
}

async function cleanupEvidenceRecords() {
  const questions = await prisma.question.findMany({
    where: { text: { startsWith: 'P5 Evidence' } },
    select: { id: true },
  })
  const questionIds = questions.map((item) => item.id)

  const exams = await prisma.exam.findMany({
    where: { title: { startsWith: 'P5 Evidence' } },
    select: { id: true },
  })
  const examIds = exams.map((item) => item.id)
  const attempts = await prisma.studentExamAttempt.findMany({
    where: { examId: { in: examIds } },
    select: { id: true },
  })
  const attemptIds = attempts.map((item) => item.id)

  const rules = await prisma.courseworkRule.findMany({
    where: { rules: { startsWith: 'P5 Evidence' } },
    select: { id: true },
  })
  const ruleIds = rules.map((item) => item.id)

  const assignments = await prisma.courseworkAssignment.findMany({
    where: { title: { startsWith: 'P5 Evidence' } },
    select: { id: true },
  })
  const assignmentIds = assignments.map((item) => item.id)

  const ebooks = await prisma.ebookUpload.findMany({
    where: { title: { startsWith: 'P5 Evidence' } },
    select: { id: true, fileName: true },
  })
  const ebookIds = ebooks.map((item) => item.id)

  if (attemptIds.length > 0) {
    await prisma.studentAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } })
    await prisma.studentExamAttempt.deleteMany({ where: { id: { in: attemptIds } } })
  }
  if (examIds.length > 0) {
    await prisma.examQuestion.deleteMany({ where: { examId: { in: examIds } } })
    await prisma.examTranslation.deleteMany({ where: { examId: { in: examIds } } })
    await prisma.exam.deleteMany({ where: { id: { in: examIds } } })
  }
  if (questionIds.length > 0) {
    await prisma.questionOptionTranslation.deleteMany({
      where: { questionOptionId: { in: (await prisma.questionOption.findMany({ where: { questionId: { in: questionIds } }, select: { id: true } })).map((item) => item.id) } },
    })
    await prisma.questionTranslation.deleteMany({ where: { questionId: { in: questionIds } } })
    await prisma.questionOption.deleteMany({ where: { questionId: { in: questionIds } } })
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } })
  }
  if (assignmentIds.length > 0) {
    await prisma.courseworkAccessRequest.deleteMany({ where: { assignmentId: { in: assignmentIds } } })
    await prisma.courseworkSubmission.deleteMany({ where: { assignmentId: { in: assignmentIds } } })
    await prisma.courseworkAssignmentTranslation.deleteMany({ where: { assignmentId: { in: assignmentIds } } })
    await prisma.courseworkAssignment.deleteMany({ where: { id: { in: assignmentIds } } })
  }
  if (ruleIds.length > 0) {
    await prisma.courseworkRuleTranslation.deleteMany({ where: { ruleId: { in: ruleIds } } })
    await prisma.courseworkRule.deleteMany({ where: { id: { in: ruleIds } } })
  }
  if (ebookIds.length > 0) {
    await prisma.ebookUploadTranslation.deleteMany({ where: { ebookUploadId: { in: ebookIds } } })
    await prisma.ebookUpload.deleteMany({ where: { id: { in: ebookIds } } })
  }
  for (const ebook of ebooks) {
    const filePath = path.join(process.cwd(), 'public', 'uploads', 'ebooks', ebook.fileName)
    await fs.rm(filePath, { force: true }).catch(() => {})
  }
}

async function createQuestion({
  teacherId,
  subjectId,
  languageId,
  groupId,
  academicYearId,
  semesterId,
  academicOfferingId = null,
  text,
  optionPrefix,
  expectedAnswer = null,
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
      expectedAnswer,
      explanation: `${text} explanation`,
      marks: 5,
      difficulty: 'medium',
      isActive: false,
      options: {
        create: [
          { text: `${optionPrefix} Option A`, isCorrect: true, orderIndex: 0 },
          { text: `${optionPrefix} Option B`, isCorrect: false, orderIndex: 1 },
          { text: `${optionPrefix} Option C`, isCorrect: false, orderIndex: 2 },
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
      expectedAnswer,
      explanation: `${text} explanation`,
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

  return prisma.question.findUniqueOrThrow({
    where: { id: question.id },
    include: {
      translations: true,
      options: { include: { translations: true }, orderBy: { orderIndex: 'asc' } },
    },
  })
}

async function createExam({
  teacherId,
  departmentId,
  subjectId,
  languageId,
  groupId,
  academicYearId,
  semesterId,
  academicOfferingId = null,
  title,
  instructions,
  questionId,
  startOffsetMinutes = -30,
  endOffsetMinutes = 180,
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
      status: 'DRAFT',
      resultMode: ResultMode.AUTO,
      totalMarks: 5,
      passingMarks: 3,
      duration: 45,
      startTime: new Date(now + startOffsetMinutes * 60 * 1000),
      endTime: new Date(now + endOffsetMinutes * 60 * 1000),
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

  return prisma.exam.findUniqueOrThrow({
    where: { id: exam.id },
    include: { translations: true, questions: { include: { question: { include: { translations: true, options: { include: { translations: true } } } } } } },
  })
}

export async function ensurePhase5EvidenceFixtures() {
  await cleanupEvidenceRecords()

  const cse = await prisma.department.findUniqueOrThrow({ where: { code: 'CSE' } })
  const eee = await prisma.department.findUniqueOrThrow({ where: { code: 'EEE' } })
  const english = await prisma.language.findUniqueOrThrow({ where: { code: 'EN' } })
  const russian = await prisma.language.findUniqueOrThrow({ where: { code: 'RU' } })
  const arabic = await prisma.language.findUniqueOrThrow({ where: { code: 'AR' } })

  const [johnUser, sarahUser, cseAdminUser] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: 'teacher.john@examflow.pro' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'teacher.sarah@examflow.pro' } }),
    prisma.user.findUniqueOrThrow({ where: { email: 'cse.admin@examflow.pro' } }),
  ])

  const john = await prisma.teacherProfile.findUniqueOrThrow({ where: { userId: johnUser.id } })
  const sarah = await prisma.teacherProfile.findUniqueOrThrow({ where: { userId: sarahUser.id } })

  const examinerUser = await ensureUser({
    email: 'teacher.examiner@examflow.pro',
    name: 'Mikhail Examiner',
    role: UserRole.TEACHER,
    password: 'Teacher@123',
  })
  const unassignedTeacherUser = await ensureUser({
    email: 'teacher.unassigned@examflow.pro',
    name: 'Una Teacher',
    role: UserRole.TEACHER,
    password: 'Teacher@123',
  })
  const englishStudentUser = await ensureUser({
    email: 'p5.english.student@examflow.pro',
    name: 'P5 English Student',
    role: UserRole.STUDENT,
    password: 'Student@123',
  })
  const russianStudentUser = await ensureUser({
    email: 'p5.russian.student@examflow.pro',
    name: 'P5 Russian Student',
    role: UserRole.STUDENT,
    password: 'Student@123',
  })

  const examiner = await ensureTeacherProfile(examinerUser.id, cse.id)
  await ensureTeacherProfile(unassignedTeacherUser.id, cse.id)
  const englishStudent = await ensureStudentProfile(englishStudentUser.id, cse.id)
  const russianStudent = await ensureStudentProfile(russianStudentUser.id, cse.id)

  const [johnMembership, sarahMembership, examinerMembership] = await Promise.all([
    ensureMembership(john.id, cse.id, 'Lead Teacher'),
    ensureMembership(sarah.id, cse.id, 'Assistant Teacher'),
    ensureMembership(examiner.id, cse.id, 'Examiner'),
  ])

  const legacyEnglish = await prisma.teacherAssignment.findFirstOrThrow({
    where: { teacherId: john.id, languageId: english.id },
    include: { subject: true, language: true, group: true, academicYear: true, semester: true },
  })

  const russianOffering = await prisma.academicOffering.findFirstOrThrow({
    where: {
      departmentId: cse.id,
      languageId: russian.id,
    },
    include: {
      subject: true,
      language: true,
      group: true,
      programYear: true,
      semester: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const russianLegacy = await ensureLegacyAssignment({
    teacherId: john.id,
    departmentId: cse.id,
    subjectId: russianOffering.subjectId,
    languageId: russianOffering.languageId,
    groupId: russianOffering.groupId,
    academicYearId: russianOffering.group.academicYearId ?? russianOffering.programYearId,
    semesterId: russianOffering.semesterId,
    academicOfferingId: russianOffering.id,
  })

  await Promise.all([
    ensureTeachingAssignment({
      teacherId: john.id,
      membershipId: johnMembership.id,
      departmentId: cse.id,
      academicOfferingId: russianOffering.id,
      approvedById: cseAdminUser.id,
      notes: 'P5 Evidence Lead RU',
      roles: [TeachingAssignmentRoleType.LEAD_TEACHER],
      isPrimary: true,
    }),
    ensureTeachingAssignment({
      teacherId: sarah.id,
      membershipId: sarahMembership.id,
      departmentId: cse.id,
      academicOfferingId: russianOffering.id,
      approvedById: cseAdminUser.id,
      notes: 'P5 Evidence Assistant RU',
      roles: [TeachingAssignmentRoleType.ASSISTANT_TEACHER],
    }),
    ensureTeachingAssignment({
      teacherId: examiner.id,
      membershipId: examinerMembership.id,
      departmentId: cse.id,
      academicOfferingId: russianOffering.id,
      approvedById: cseAdminUser.id,
      notes: 'P5 Evidence Examiner RU',
      roles: [TeachingAssignmentRoleType.EXAMINER],
    }),
  ])

  await Promise.all([
    ensureStudentSubject({
      studentId: englishStudent.id,
      subjectId: legacyEnglish.subjectId,
      languageId: legacyEnglish.languageId,
      groupId: legacyEnglish.groupId,
      academicYearId: legacyEnglish.academicYearId,
      semesterId: legacyEnglish.semesterId,
      academicOfferingId: legacyEnglish.academicOfferingId,
    }),
    ensureStudentSubject({
      studentId: russianStudent.id,
      subjectId: russianLegacy.subjectId,
      languageId: russianLegacy.languageId,
      groupId: russianLegacy.groupId,
      academicYearId: russianLegacy.academicYearId,
      semesterId: russianLegacy.semesterId,
      academicOfferingId: russianLegacy.academicOfferingId,
    }),
  ])

  const [questionEn, questionRu, questionBroken] = await Promise.all([
    createQuestion({
      teacherId: john.id,
      subjectId: legacyEnglish.subjectId,
      languageId: legacyEnglish.languageId,
      groupId: legacyEnglish.groupId,
      academicYearId: legacyEnglish.academicYearId,
      semesterId: legacyEnglish.semesterId,
      academicOfferingId: legacyEnglish.academicOfferingId,
      text: 'P5 Evidence EN Question',
      optionPrefix: 'P5 EN',
    }),
    createQuestion({
      teacherId: john.id,
      subjectId: russianLegacy.subjectId,
      languageId: russianLegacy.languageId,
      groupId: russianLegacy.groupId,
      academicYearId: russianLegacy.academicYearId,
      semesterId: russianLegacy.semesterId,
      academicOfferingId: russianLegacy.academicOfferingId,
      text: 'P5 Evidence RU Question',
      optionPrefix: 'P5 RU',
    }),
    createQuestion({
      teacherId: john.id,
      subjectId: legacyEnglish.subjectId,
      languageId: legacyEnglish.languageId,
      groupId: legacyEnglish.groupId,
      academicYearId: legacyEnglish.academicYearId,
      semesterId: legacyEnglish.semesterId,
      academicOfferingId: legacyEnglish.academicOfferingId,
      text: 'P5 Evidence Broken EN Question',
      optionPrefix: 'P5 Broken',
    }),
  ])

  const brokenOption = questionBroken.options[2]
  await prisma.questionOptionTranslation.deleteMany({
    where: {
      questionOptionId: brokenOption.id,
      languageId: english.id,
    },
  })

  const [examEn, examRu, examBroken, examSocketBroken] = await Promise.all([
    createExam({
      teacherId: john.id,
      departmentId: cse.id,
      subjectId: legacyEnglish.subjectId,
      languageId: legacyEnglish.languageId,
      groupId: legacyEnglish.groupId,
      academicYearId: legacyEnglish.academicYearId,
      semesterId: legacyEnglish.semesterId,
      academicOfferingId: legacyEnglish.academicOfferingId,
      title: 'P5 Evidence EN Exam',
      instructions: 'P5 Evidence EN instructions',
      questionId: questionEn.id,
    }),
    createExam({
      teacherId: john.id,
      departmentId: cse.id,
      subjectId: russianLegacy.subjectId,
      languageId: russianLegacy.languageId,
      groupId: russianLegacy.groupId,
      academicYearId: russianLegacy.academicYearId,
      semesterId: russianLegacy.semesterId,
      academicOfferingId: russianLegacy.academicOfferingId,
      title: 'P5 Evidence RU Exam',
      instructions: 'P5 Evidence RU instructions',
      questionId: questionRu.id,
    }),
    createExam({
      teacherId: john.id,
      departmentId: cse.id,
      subjectId: legacyEnglish.subjectId,
      languageId: legacyEnglish.languageId,
      groupId: legacyEnglish.groupId,
      academicYearId: legacyEnglish.academicYearId,
      semesterId: legacyEnglish.semesterId,
      academicOfferingId: legacyEnglish.academicOfferingId,
      title: 'P5 Evidence Broken EN Exam',
      instructions: 'P5 Evidence broken instructions',
      questionId: questionBroken.id,
    }),
    createExam({
      teacherId: john.id,
      departmentId: cse.id,
      subjectId: legacyEnglish.subjectId,
      languageId: legacyEnglish.languageId,
      groupId: legacyEnglish.groupId,
      academicYearId: legacyEnglish.academicYearId,
      semesterId: legacyEnglish.semesterId,
      academicOfferingId: legacyEnglish.academicOfferingId,
      title: 'P5 Evidence Socket Broken EN Exam',
      instructions: 'P5 Evidence socket broken instructions',
      questionId: questionBroken.id,
    }).then((exam) =>
      prisma.exam.update({
        where: { id: exam.id },
        data: { status: 'SCHEDULED' },
        include: { translations: true },
      })
    ),
  ])

  const [ruleEn, ruleRu] = await Promise.all([
    prisma.courseworkRule.upsert({
      where: {
        teacherId_subjectId_languageId_groupId_academicYearId_semesterId: {
          teacherId: john.id,
          subjectId: legacyEnglish.subjectId,
          languageId: legacyEnglish.languageId,
          groupId: legacyEnglish.groupId,
          academicYearId: legacyEnglish.academicYearId,
          semesterId: legacyEnglish.semesterId,
        },
      },
      update: {
        departmentId: cse.id,
        academicOfferingId: legacyEnglish.academicOfferingId,
        rules: 'P5 Evidence EN coursework rules',
      },
      create: {
        teacherId: john.id,
        departmentId: cse.id,
        subjectId: legacyEnglish.subjectId,
        languageId: legacyEnglish.languageId,
        groupId: legacyEnglish.groupId,
        academicYearId: legacyEnglish.academicYearId,
        semesterId: legacyEnglish.semesterId,
        academicOfferingId: legacyEnglish.academicOfferingId,
        rules: 'P5 Evidence EN coursework rules',
      },
    }),
    prisma.courseworkRule.upsert({
      where: {
        teacherId_subjectId_languageId_groupId_academicYearId_semesterId: {
          teacherId: john.id,
          subjectId: russianLegacy.subjectId,
          languageId: russianLegacy.languageId,
          groupId: russianLegacy.groupId,
          academicYearId: russianLegacy.academicYearId,
          semesterId: russianLegacy.semesterId,
        },
      },
      update: {
        departmentId: cse.id,
        academicOfferingId: russianLegacy.academicOfferingId,
        rules: 'P5 Evidence RU coursework rules',
      },
      create: {
        teacherId: john.id,
        departmentId: cse.id,
        subjectId: russianLegacy.subjectId,
        languageId: russianLegacy.languageId,
        groupId: russianLegacy.groupId,
        academicYearId: russianLegacy.academicYearId,
        semesterId: russianLegacy.semesterId,
        academicOfferingId: russianLegacy.academicOfferingId,
        rules: 'P5 Evidence RU coursework rules',
      },
    }),
  ])

  await Promise.all([
    prisma.courseworkRuleTranslation.upsert({
      where: {
        ruleId_languageId: {
          ruleId: ruleEn.id,
          languageId: english.id,
        },
      },
      update: {
        rules: ruleEn.rules,
        status: TranslationStatus.COMPLETE,
        completedAt: new Date(),
      },
      create: {
        ruleId: ruleEn.id,
        languageId: english.id,
        rules: ruleEn.rules,
        status: TranslationStatus.COMPLETE,
        completedAt: new Date(),
      },
    }),
    prisma.courseworkRuleTranslation.upsert({
      where: {
        ruleId_languageId: {
          ruleId: ruleRu.id,
          languageId: russian.id,
        },
      },
      update: {
        rules: ruleRu.rules,
        status: TranslationStatus.COMPLETE,
        completedAt: new Date(),
      },
      create: {
        ruleId: ruleRu.id,
        languageId: russian.id,
        rules: ruleRu.rules,
        status: TranslationStatus.COMPLETE,
        completedAt: new Date(),
      },
    }),
  ])

  const [assignmentEn, assignmentRu] = await Promise.all([
    prisma.courseworkAssignment.upsert({
      where: {
        teacherId_studentId_subjectId_languageId_groupId_academicYearId_semesterId: {
          teacherId: john.id,
          studentId: englishStudent.id,
          subjectId: legacyEnglish.subjectId,
          languageId: legacyEnglish.languageId,
          groupId: legacyEnglish.groupId,
          academicYearId: legacyEnglish.academicYearId,
          semesterId: legacyEnglish.semesterId,
        },
      },
      update: {
        ruleId: ruleEn.id,
        departmentId: cse.id,
        academicOfferingId: legacyEnglish.academicOfferingId,
        title: 'P5 Evidence EN Coursework',
        rules: ruleEn.rules,
      },
      create: {
        teacherId: john.id,
        studentId: englishStudent.id,
        ruleId: ruleEn.id,
        departmentId: cse.id,
        subjectId: legacyEnglish.subjectId,
        languageId: legacyEnglish.languageId,
        groupId: legacyEnglish.groupId,
        academicYearId: legacyEnglish.academicYearId,
        semesterId: legacyEnglish.semesterId,
        academicOfferingId: legacyEnglish.academicOfferingId,
        title: 'P5 Evidence EN Coursework',
        rules: ruleEn.rules,
      },
    }),
    prisma.courseworkAssignment.upsert({
      where: {
        teacherId_studentId_subjectId_languageId_groupId_academicYearId_semesterId: {
          teacherId: john.id,
          studentId: russianStudent.id,
          subjectId: russianLegacy.subjectId,
          languageId: russianLegacy.languageId,
          groupId: russianLegacy.groupId,
          academicYearId: russianLegacy.academicYearId,
          semesterId: russianLegacy.semesterId,
        },
      },
      update: {
        ruleId: ruleRu.id,
        departmentId: cse.id,
        academicOfferingId: russianLegacy.academicOfferingId,
        title: 'P5 Evidence RU Coursework',
        rules: ruleRu.rules,
      },
      create: {
        teacherId: john.id,
        studentId: russianStudent.id,
        ruleId: ruleRu.id,
        departmentId: cse.id,
        subjectId: russianLegacy.subjectId,
        languageId: russianLegacy.languageId,
        groupId: russianLegacy.groupId,
        academicYearId: russianLegacy.academicYearId,
        semesterId: russianLegacy.semesterId,
        academicOfferingId: russianLegacy.academicOfferingId,
        title: 'P5 Evidence RU Coursework',
        rules: ruleRu.rules,
      },
    }),
  ])

  await Promise.all([
    prisma.courseworkAssignmentTranslation.upsert({
      where: {
        assignmentId_languageId: {
          assignmentId: assignmentEn.id,
          languageId: english.id,
        },
      },
      update: {
        title: assignmentEn.title,
        rules: assignmentEn.rules,
        status: TranslationStatus.COMPLETE,
        completedAt: new Date(),
      },
      create: {
        assignmentId: assignmentEn.id,
        languageId: english.id,
        title: assignmentEn.title,
        rules: assignmentEn.rules,
        status: TranslationStatus.COMPLETE,
        completedAt: new Date(),
      },
    }),
    prisma.courseworkAssignmentTranslation.upsert({
      where: {
        assignmentId_languageId: {
          assignmentId: assignmentRu.id,
          languageId: russian.id,
        },
      },
      update: {
        title: assignmentRu.title,
        rules: assignmentRu.rules,
        status: TranslationStatus.COMPLETE,
        completedAt: new Date(),
      },
      create: {
        assignmentId: assignmentRu.id,
        languageId: russian.id,
        title: assignmentRu.title,
        rules: assignmentRu.rules,
        status: TranslationStatus.COMPLETE,
        completedAt: new Date(),
      },
    }),
  ])

  const [enPdf, ruPdf] = await Promise.all([
    ensurePdfFile('p5-evidence-en.pdf'),
    ensurePdfFile('p5-evidence-ru.pdf'),
  ])

  const [ebookEn, ebookRu] = await Promise.all([
    prisma.ebookUpload.create({
      data: {
        teacherId: john.id,
        departmentId: cse.id,
        subjectId: legacyEnglish.subjectId,
        languageId: legacyEnglish.languageId,
        groupId: legacyEnglish.groupId,
        academicYearId: legacyEnglish.academicYearId,
        semesterId: legacyEnglish.semesterId,
        academicOfferingId: legacyEnglish.academicOfferingId,
        title: 'P5 Evidence EN Ebook',
        description: 'P5 Evidence EN ebook description',
        author: 'P5 Evidence Author EN',
        category: 'P5 Evidence Category EN',
        fileName: enPdf.fileName,
        fileUrl: enPdf.fileUrl,
        fileSizeBytes: enPdf.fileSizeBytes,
      },
    }),
    prisma.ebookUpload.create({
      data: {
        teacherId: john.id,
        departmentId: cse.id,
        subjectId: russianLegacy.subjectId,
        languageId: russianLegacy.languageId,
        groupId: russianLegacy.groupId,
        academicYearId: russianLegacy.academicYearId,
        semesterId: russianLegacy.semesterId,
        academicOfferingId: russianLegacy.academicOfferingId,
        title: 'P5 Evidence RU Ebook',
        description: 'P5 Evidence RU ebook description',
        author: 'P5 Evidence Author RU',
        category: 'P5 Evidence Category RU',
        fileName: ruPdf.fileName,
        fileUrl: ruPdf.fileUrl,
        fileSizeBytes: ruPdf.fileSizeBytes,
      },
    }),
  ])

  await prisma.ebookUploadTranslation.createMany({
    data: [
      {
        ebookUploadId: ebookEn.id,
        languageId: english.id,
        title: ebookEn.title,
        description: ebookEn.description,
        author: ebookEn.author,
        category: ebookEn.category,
        status: TranslationStatus.COMPLETE,
        completedAt: new Date(),
      },
      {
        ebookUploadId: ebookRu.id,
        languageId: russian.id,
        title: ebookRu.title,
        description: ebookRu.description,
        author: ebookRu.author,
        category: ebookRu.category,
        status: TranslationStatus.COMPLETE,
        completedAt: new Date(),
      },
    ],
  })

  return {
    ids: {
      department: { cse: cse.id, eee: eee.id },
      language: { english: english.id, russian: russian.id, arabic: arabic.id },
      teacher: {
        johnUserId: johnUser.id,
        johnProfileId: john.id,
        sarahUserId: sarahUser.id,
        sarahProfileId: sarah.id,
        examinerUserId: examinerUser.id,
        examinerProfileId: examiner.id,
        unassignedUserId: unassignedTeacherUser.id,
      },
      student: {
        englishUserId: englishStudentUser.id,
        englishProfileId: englishStudent.id,
        russianUserId: russianStudentUser.id,
        russianProfileId: russianStudent.id,
      },
      scope: {
        englishLegacyAssignmentId: legacyEnglish.id,
        russianLegacyAssignmentId: russianLegacy.id,
        russianOfferingId: russianOffering.id,
      },
      question: {
        english: questionEn.id,
        russian: questionRu.id,
        broken: questionBroken.id,
      },
      exam: {
        english: examEn.id,
        russian: examRu.id,
        broken: examBroken.id,
        socketBroken: examSocketBroken.id,
      },
      coursework: {
        ruleEnglish: ruleEn.id,
        ruleRussian: ruleRu.id,
        assignmentEnglish: assignmentEn.id,
        assignmentRussian: assignmentRu.id,
      },
      ebook: {
        english: ebookEn.id,
        russian: ebookRu.id,
      },
    },
    emails: {
      superAdmin: 'admin@examflow.pro',
      cseAdmin: 'cse.admin@examflow.pro',
      eeeAdmin: 'eee.admin@examflow.pro',
      leadTeacher: 'teacher.john@examflow.pro',
      assistantTeacher: 'teacher.sarah@examflow.pro',
      examiner: 'teacher.examiner@examflow.pro',
      unassignedTeacher: 'teacher.unassigned@examflow.pro',
      englishStudent: 'p5.english.student@examflow.pro',
      russianStudent: 'p5.russian.student@examflow.pro',
    },
    passwords: {
      admin: 'Admin@123',
      teacher: 'Teacher@123',
      student: 'Student@123',
    },
  }
}

export async function closeFixturesPrisma() {
  await prisma.$disconnect()
}
