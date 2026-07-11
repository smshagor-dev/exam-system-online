import assert from 'assert'
import bcrypt from 'bcryptjs'
import { readFile } from 'fs/promises'

type PrismaClientType = import('@prisma/client').PrismaClient

async function getBaseDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const envRaw = await readFile('.env', 'utf8')
  const match = envRaw.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)
  if (!match) {
    throw new Error('DATABASE_URL is required for Phase 3 lifecycle tests.')
  }

  return match[1]
}

function withDatabaseName(databaseUrl: string, suffix: string) {
  const [base, query = ''] = databaseUrl.split('?')
  const dbName = base.slice(base.lastIndexOf('/') + 1)
  const root = base.slice(0, base.lastIndexOf('/') + 1)
  return `${root}${dbName}${suffix}${query ? `?${query}` : ''}`
}

type DeleteManyModel = { deleteMany: () => Promise<unknown> }

type CleanupClient = {
  activityLog: DeleteManyModel
  notification: DeleteManyModel
  resultReview: DeleteManyModel
  examResult: DeleteManyModel
  studentAnswer: DeleteManyModel
  studentExamAttempt: DeleteManyModel
  examSession: DeleteManyModel
  examQuestion: DeleteManyModel
  questionOption: DeleteManyModel
  question: DeleteManyModel
  exam: DeleteManyModel
  courseworkSubmission: DeleteManyModel
  courseworkAccessRequest: DeleteManyModel
  courseworkAssignment: DeleteManyModel
  courseworkRule: DeleteManyModel
  ebookUpload: DeleteManyModel
  teacherAssignment: DeleteManyModel
  studentGraduation: DeleteManyModel
  studentLeave: DeleteManyModel
  studentTransfer: DeleteManyModel
  studentPromotion: DeleteManyModel
  studentAcademicHistory: DeleteManyModel
  studentEnrollment: DeleteManyModel
  studentSubject: DeleteManyModel
  academicOffering: DeleteManyModel
  programSubject: DeleteManyModel
  programSemester: DeleteManyModel
  programYear: DeleteManyModel
  academicSession: DeleteManyModel
  departmentLanguage: DeleteManyModel
  academicProgram: DeleteManyModel
  degreeLevel: DeleteManyModel
  studentProfile: DeleteManyModel
  teacherProfile: DeleteManyModel
  subject: DeleteManyModel
  language: DeleteManyModel
  group: DeleteManyModel
  semester: DeleteManyModel
  academicYear: DeleteManyModel
  department: DeleteManyModel
  user: DeleteManyModel
}

async function cleanup(prisma: CleanupClient) {
  await prisma.activityLog.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.resultReview.deleteMany()
  await prisma.examResult.deleteMany()
  await prisma.studentAnswer.deleteMany()
  await prisma.studentExamAttempt.deleteMany()
  await prisma.examSession.deleteMany()
  await prisma.examQuestion.deleteMany()
  await prisma.questionOption.deleteMany()
  await prisma.question.deleteMany()
  await prisma.exam.deleteMany()
  await prisma.courseworkSubmission.deleteMany()
  await prisma.courseworkAccessRequest.deleteMany()
  await prisma.courseworkAssignment.deleteMany()
  await prisma.courseworkRule.deleteMany()
  await prisma.ebookUpload.deleteMany()
  await prisma.teacherAssignment.deleteMany()
  await prisma.studentGraduation.deleteMany()
  await prisma.studentLeave.deleteMany()
  await prisma.studentTransfer.deleteMany()
  await prisma.studentPromotion.deleteMany()
  await prisma.studentAcademicHistory.deleteMany()
  await prisma.studentEnrollment.deleteMany()
  await prisma.studentSubject.deleteMany()
  await prisma.academicOffering.deleteMany()
  await prisma.studentSubject.deleteMany()
  await prisma.group.deleteMany()
  await prisma.programSubject.deleteMany()
  await prisma.programSemester.deleteMany()
  await prisma.programYear.deleteMany()
  await prisma.academicSession.deleteMany()
  await prisma.departmentLanguage.deleteMany()
  await prisma.academicProgram.deleteMany()
  await prisma.degreeLevel.deleteMany()
  await prisma.studentProfile.deleteMany()
  await prisma.teacherProfile.deleteMany()
  await prisma.subject.deleteMany()
  await prisma.language.deleteMany()
  await prisma.semester.deleteMany()
  await prisma.academicYear.deleteMany()
  await prisma.department.deleteMany()
  await prisma.user.deleteMany()
}

type TestCase = {
  id: string
  category: string
  name: string
  run: () => Promise<void>
}

type CategorySummary = {
  total: number
  passed: number
  failed: number
  skipped: number
}

async function setupFixture(prisma: PrismaClientType) {
  const { UserRole, QuestionType, ExamStatus, ResultMode, ResultStatus } = await import('@prisma/client')
  const hash = (value: string) => bcrypt.hashSync(value, 10)

  const year1 = await prisma.academicYear.create({ data: { name: 'Year 1', year: 1 } })
  const year2 = await prisma.academicYear.create({ data: { name: 'Year 2', year: 2 } })
  const year3 = await prisma.academicYear.create({ data: { name: 'Year 3', year: 3 } })
  const semester1 = await prisma.semester.create({ data: { name: 'Semester 1', number: 1 } })
  const semester2 = await prisma.semester.create({ data: { name: 'Semester 2', number: 2 } })
  const semester3 = await prisma.semester.create({ data: { name: 'Semester 3', number: 3 } })
  const english = await prisma.language.create({ data: { name: 'English', code: 'EN' } })
  const bangla = await prisma.language.create({ data: { name: 'Bangla', code: 'BN' } })
  const russian = await prisma.language.create({ data: { name: 'Russian', code: 'RU' } })

  const cse = await prisma.department.create({ data: { name: 'Computer Science', code: 'CSE' } })
  const eee = await prisma.department.create({ data: { name: 'Electrical', code: 'EEE' } })

  const bsc = await prisma.degreeLevel.create({
    data: { name: 'Bachelor of Science', code: 'BSC', defaultYears: 2, sortOrder: 1 },
  })
  const msc = await prisma.degreeLevel.create({
    data: { name: 'Master of Science', code: 'MSC', defaultYears: 1, sortOrder: 2 },
  })

  const session2026 = await prisma.academicSession.create({
    data: {
      name: '2026-2027',
      code: '2026-2027',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T23:59:59.999Z'),
      isCurrent: true,
      isActive: true,
    },
  })
  const session2027 = await prisma.academicSession.create({
    data: {
      name: '2027-2028',
      code: '2027-2028',
      startDate: new Date('2027-01-01T00:00:00.000Z'),
      endDate: new Date('2027-12-31T23:59:59.999Z'),
      isCurrent: false,
      isActive: true,
    },
  })
  const inactiveSession = await prisma.academicSession.create({
    data: {
      name: '2025-2026',
      code: '2025-2026',
      startDate: new Date('2025-01-01T00:00:00.000Z'),
      endDate: new Date('2025-12-31T23:59:59.999Z'),
      isCurrent: false,
      isActive: false,
    },
  })

  const cseEnglish = await prisma.departmentLanguage.create({ data: { departmentId: cse.id, languageId: english.id } })
  const cseBangla = await prisma.departmentLanguage.create({ data: { departmentId: cse.id, languageId: bangla.id } })
  const cseInactiveLang = await prisma.departmentLanguage.create({
    data: { departmentId: cse.id, languageId: russian.id, isActive: false },
  })
  const eeeRussian = await prisma.departmentLanguage.create({ data: { departmentId: eee.id, languageId: russian.id } })

  const bscProgram = await prisma.academicProgram.create({
    data: {
      name: 'BSc in Computer Science',
      code: 'BSC-CS',
      degreeLevelId: bsc.id,
      departmentId: cse.id,
      durationYears: 2,
      totalSemesters: 4,
      isActive: true,
    },
  })
  const inactiveProgram = await prisma.academicProgram.create({
    data: {
      name: 'BSc in Archived Computing',
      code: 'BSC-ARC',
      degreeLevelId: bsc.id,
      departmentId: cse.id,
      durationYears: 2,
      totalSemesters: 4,
      isActive: false,
    },
  })
  const mscProgram = await prisma.academicProgram.create({
    data: {
      name: 'MSc in Applied AI',
      code: 'MSC-AI',
      degreeLevelId: msc.id,
      departmentId: cse.id,
      durationYears: 1,
      totalSemesters: 2,
      isActive: true,
    },
  })
  const eeeProgram = await prisma.academicProgram.create({
    data: {
      name: 'BSc in Electrical Engineering',
      code: 'BSC-EEE',
      degreeLevelId: bsc.id,
      departmentId: eee.id,
      durationYears: 2,
      totalSemesters: 4,
      isActive: true,
    },
  })

  const bscYear1 = await prisma.programYear.create({
    data: { programId: bscProgram.id, yearNumber: 1, name: 'BSc Year One', code: 'BSC-Y1', sortOrder: 1 },
  })
  const bscYear2 = await prisma.programYear.create({
    data: { programId: bscProgram.id, yearNumber: 2, name: 'BSc Year Two', code: 'BSC-Y2', sortOrder: 2 },
  })
  const bscYear3 = await prisma.programYear.create({
    data: { programId: bscProgram.id, yearNumber: 3, name: 'BSc Year Three', code: 'BSC-Y3', sortOrder: 3 },
  })
  const mscYear1 = await prisma.programYear.create({
    data: { programId: mscProgram.id, yearNumber: 1, name: 'MSc Year One', code: 'MSC-Y1', sortOrder: 1 },
  })
  const eeeYear1 = await prisma.programYear.create({
    data: { programId: eeeProgram.id, yearNumber: 1, name: 'EEE Year One', code: 'EEE-Y1', sortOrder: 1 },
  })

  const bscSem1 = await prisma.programSemester.create({
    data: { programId: bscProgram.id, programYearId: bscYear1.id, semesterId: semester1.id, semesterNumber: 1 },
  })
  const bscSem2 = await prisma.programSemester.create({
    data: { programId: bscProgram.id, programYearId: bscYear1.id, semesterId: semester2.id, semesterNumber: 2 },
  })
  const bscSem3 = await prisma.programSemester.create({
    data: { programId: bscProgram.id, programYearId: bscYear2.id, semesterId: semester1.id, semesterNumber: 3 },
  })
  const bscSem4 = await prisma.programSemester.create({
    data: { programId: bscProgram.id, programYearId: bscYear2.id, semesterId: semester2.id, semesterNumber: 4 },
  })
  const bscSem5 = await prisma.programSemester.create({
    data: { programId: bscProgram.id, programYearId: bscYear3.id, semesterId: semester3.id, semesterNumber: 5 },
  })
  const mscSem1 = await prisma.programSemester.create({
    data: { programId: mscProgram.id, programYearId: mscYear1.id, semesterId: semester1.id, semesterNumber: 1 },
  })
  const mscSem2 = await prisma.programSemester.create({
    data: { programId: mscProgram.id, programYearId: mscYear1.id, semesterId: semester2.id, semesterNumber: 2 },
  })
  const eeeSem1 = await prisma.programSemester.create({
    data: { programId: eeeProgram.id, programYearId: eeeYear1.id, semesterId: semester1.id, semesterNumber: 1 },
  })

  const bscGroupY1A = await prisma.group.create({
    data: {
      name: 'CSE-Y1-A',
      code: 'CSE-Y1-A',
      academicYearId: year1.id,
      departmentId: cse.id,
      programId: bscProgram.id,
      languageId: english.id,
      departmentLanguageId: cseEnglish.id,
      academicSessionId: session2026.id,
      programYearId: bscYear1.id,
      currentProgramSemesterId: bscSem1.id,
      isActive: true,
    },
  })
  const bscGroupY1B = await prisma.group.create({
    data: {
      name: 'CSE-Y1-B',
      code: 'CSE-Y1-B',
      academicYearId: year1.id,
      departmentId: cse.id,
      programId: bscProgram.id,
      languageId: english.id,
      departmentLanguageId: cseEnglish.id,
      academicSessionId: session2026.id,
      programYearId: bscYear1.id,
      currentProgramSemesterId: bscSem1.id,
      isActive: true,
    },
  })
  const bscGroupY2A = await prisma.group.create({
    data: {
      name: 'CSE-Y2-A',
      code: 'CSE-Y2-A',
      academicYearId: year2.id,
      departmentId: cse.id,
      programId: bscProgram.id,
      languageId: bangla.id,
      departmentLanguageId: cseBangla.id,
      academicSessionId: session2026.id,
      programYearId: bscYear2.id,
      currentProgramSemesterId: bscSem3.id,
      isActive: true,
    },
  })
  const bscGroupY3A = await prisma.group.create({
    data: {
      name: 'CSE-Y3-A',
      code: 'CSE-Y3-A',
      academicYearId: year3.id,
      departmentId: cse.id,
      programId: bscProgram.id,
      languageId: bangla.id,
      departmentLanguageId: cseBangla.id,
      academicSessionId: session2026.id,
      programYearId: bscYear3.id,
      currentProgramSemesterId: bscSem5.id,
      isActive: true,
    },
  })
  const bscGroupOtherSession = await prisma.group.create({
    data: {
      name: 'CSE-Y1-NEXT',
      code: 'CSE-Y1-NEXT',
      academicYearId: year1.id,
      departmentId: cse.id,
      programId: bscProgram.id,
      languageId: english.id,
      departmentLanguageId: cseEnglish.id,
      academicSessionId: session2027.id,
      programYearId: bscYear1.id,
      currentProgramSemesterId: bscSem1.id,
      isActive: true,
    },
  })
  const bscInactiveGroup = await prisma.group.create({
    data: {
      name: 'CSE-Y1-INACTIVE',
      code: 'CSE-Y1-INACTIVE',
      academicYearId: year1.id,
      departmentId: cse.id,
      programId: bscProgram.id,
      languageId: english.id,
      departmentLanguageId: cseEnglish.id,
      academicSessionId: session2026.id,
      programYearId: bscYear1.id,
      currentProgramSemesterId: bscSem1.id,
      isActive: false,
    },
  })
  const mscGroupA = await prisma.group.create({
    data: {
      name: 'MSC-AI-A',
      code: 'MSC-AI-A',
      academicYearId: year1.id,
      departmentId: cse.id,
      programId: mscProgram.id,
      languageId: english.id,
      departmentLanguageId: cseEnglish.id,
      academicSessionId: session2026.id,
      programYearId: mscYear1.id,
      currentProgramSemesterId: mscSem1.id,
      isActive: true,
    },
  })
  const eeeGroupA = await prisma.group.create({
    data: {
      name: 'EEE-Y1-A',
      code: 'EEE-Y1-A',
      academicYearId: year1.id,
      departmentId: eee.id,
      programId: eeeProgram.id,
      languageId: russian.id,
      departmentLanguageId: eeeRussian.id,
      academicSessionId: session2026.id,
      programYearId: eeeYear1.id,
      currentProgramSemesterId: eeeSem1.id,
      isActive: true,
    },
  })

  const subjectIntro = await prisma.subject.create({ data: { name: 'Intro Programming', code: 'CSE101', departmentId: cse.id } })
  const subjectAlgo = await prisma.subject.create({ data: { name: 'Algorithms', code: 'CSE201', departmentId: cse.id } })
  const subjectCapstone = await prisma.subject.create({ data: { name: 'Capstone', code: 'CSE401', departmentId: cse.id } })
  const subjectAi = await prisma.subject.create({ data: { name: 'Applied AI', code: 'AI501', departmentId: cse.id } })
  const subjectMl = await prisma.subject.create({ data: { name: 'Machine Learning', code: 'AI502', departmentId: cse.id } })
  const subjectCircuits = await prisma.subject.create({ data: { name: 'Circuits', code: 'EEE101', departmentId: eee.id } })

  const bscCurrSem1 = await prisma.programSubject.create({
    data: { programId: bscProgram.id, programYearId: bscYear1.id, semesterId: semester1.id, programSemesterId: bscSem1.id, subjectId: subjectIntro.id },
  })
  await prisma.programSubject.create({
    data: { programId: bscProgram.id, programYearId: bscYear1.id, semesterId: semester2.id, programSemesterId: bscSem2.id, subjectId: subjectAlgo.id },
  })
  await prisma.programSubject.create({
    data: { programId: bscProgram.id, programYearId: bscYear2.id, semesterId: semester1.id, programSemesterId: bscSem3.id, subjectId: subjectAlgo.id },
  })
  const bscCurrSem4 = await prisma.programSubject.create({
    data: { programId: bscProgram.id, programYearId: bscYear2.id, semesterId: semester2.id, programSemesterId: bscSem4.id, subjectId: subjectCapstone.id },
  })
  const mscCurrSem1 = await prisma.programSubject.create({
    data: { programId: mscProgram.id, programYearId: mscYear1.id, semesterId: semester1.id, programSemesterId: mscSem1.id, subjectId: subjectAi.id },
  })
  const mscCurrSem2 = await prisma.programSubject.create({
    data: { programId: mscProgram.id, programYearId: mscYear1.id, semesterId: semester2.id, programSemesterId: mscSem2.id, subjectId: subjectMl.id },
  })
  const eeeCurrSem1 = await prisma.programSubject.create({
    data: { programId: eeeProgram.id, programYearId: eeeYear1.id, semesterId: semester1.id, programSemesterId: eeeSem1.id, subjectId: subjectCircuits.id },
  })

  const offeringBscSem1 = await prisma.academicOffering.create({
    data: {
      academicSessionId: session2026.id,
      programId: bscProgram.id,
      departmentId: cse.id,
      departmentLanguageId: cseEnglish.id,
      languageId: english.id,
      programYearId: bscYear1.id,
      semesterId: semester1.id,
      programSemesterId: bscSem1.id,
      groupId: bscGroupY1A.id,
      subjectId: subjectIntro.id,
      programSubjectId: bscCurrSem1.id,
      status: 'ACTIVE',
      isActive: true,
    },
  })
  const offeringBscSem2 = await prisma.academicOffering.create({
    data: {
      academicSessionId: session2026.id,
      programId: bscProgram.id,
      departmentId: cse.id,
      departmentLanguageId: cseEnglish.id,
      languageId: english.id,
      programYearId: bscYear1.id,
      semesterId: semester2.id,
      programSemesterId: bscSem2.id,
      groupId: bscGroupY1A.id,
      subjectId: subjectAlgo.id,
      status: 'ACTIVE',
      isActive: true,
    },
  })
  const offeringBscSem1Y1B = await prisma.academicOffering.create({
    data: {
      academicSessionId: session2026.id,
      programId: bscProgram.id,
      departmentId: cse.id,
      departmentLanguageId: cseEnglish.id,
      languageId: english.id,
      programYearId: bscYear1.id,
      semesterId: semester1.id,
      programSemesterId: bscSem1.id,
      groupId: bscGroupY1B.id,
      subjectId: subjectIntro.id,
      programSubjectId: bscCurrSem1.id,
      status: 'ACTIVE',
      isActive: true,
    },
  })
  const offeringBscSem3 = await prisma.academicOffering.create({
    data: {
      academicSessionId: session2026.id,
      programId: bscProgram.id,
      departmentId: cse.id,
      departmentLanguageId: cseBangla.id,
      languageId: bangla.id,
      programYearId: bscYear2.id,
      semesterId: semester1.id,
      programSemesterId: bscSem3.id,
      groupId: bscGroupY2A.id,
      subjectId: subjectAlgo.id,
      status: 'ACTIVE',
      isActive: true,
    },
  })
  const offeringBscSem4 = await prisma.academicOffering.create({
    data: {
      academicSessionId: session2026.id,
      programId: bscProgram.id,
      departmentId: cse.id,
      departmentLanguageId: cseBangla.id,
      languageId: bangla.id,
      programYearId: bscYear2.id,
      semesterId: semester2.id,
      programSemesterId: bscSem4.id,
      groupId: bscGroupY2A.id,
      subjectId: subjectCapstone.id,
      programSubjectId: bscCurrSem4.id,
      status: 'ACTIVE',
      isActive: true,
    },
  })
  const offeringMscSem1 = await prisma.academicOffering.create({
    data: {
      academicSessionId: session2026.id,
      programId: mscProgram.id,
      departmentId: cse.id,
      departmentLanguageId: cseEnglish.id,
      languageId: english.id,
      programYearId: mscYear1.id,
      semesterId: semester1.id,
      programSemesterId: mscSem1.id,
      groupId: mscGroupA.id,
      subjectId: subjectAi.id,
      programSubjectId: mscCurrSem1.id,
      status: 'ACTIVE',
      isActive: true,
    },
  })
  const offeringMscSem2 = await prisma.academicOffering.create({
    data: {
      academicSessionId: session2026.id,
      programId: mscProgram.id,
      departmentId: cse.id,
      departmentLanguageId: cseEnglish.id,
      languageId: english.id,
      programYearId: mscYear1.id,
      semesterId: semester2.id,
      programSemesterId: mscSem2.id,
      groupId: mscGroupA.id,
      subjectId: subjectMl.id,
      programSubjectId: mscCurrSem2.id,
      status: 'ACTIVE',
      isActive: true,
    },
  })
  const offeringEeeSem1 = await prisma.academicOffering.create({
    data: {
      academicSessionId: session2026.id,
      programId: eeeProgram.id,
      departmentId: eee.id,
      departmentLanguageId: eeeRussian.id,
      languageId: russian.id,
      programYearId: eeeYear1.id,
      semesterId: semester1.id,
      programSemesterId: eeeSem1.id,
      groupId: eeeGroupA.id,
      subjectId: subjectCircuits.id,
      programSubjectId: eeeCurrSem1.id,
      status: 'ACTIVE',
      isActive: true,
    },
  })

  const superAdmin = await prisma.user.create({ data: { email: 'admin@test.local', password: hash('Admin@123'), name: 'Super Admin', role: UserRole.SUPER_ADMIN } })
  const cseAdmin = await prisma.user.create({ data: { email: 'cse.admin@test.local', password: hash('Admin@123'), name: 'CSE Admin', role: UserRole.DEPARTMENT_ADMIN } })
  const eeeAdmin = await prisma.user.create({ data: { email: 'eee.admin@test.local', password: hash('Admin@123'), name: 'EEE Admin', role: UserRole.DEPARTMENT_ADMIN } })
  await prisma.department.update({ where: { id: cse.id }, data: { adminId: cseAdmin.id } })
  await prisma.department.update({ where: { id: eee.id }, data: { adminId: eeeAdmin.id } })
  const teacher = await prisma.user.create({ data: { email: 'teacher@test.local', password: hash('Teacher@123'), name: 'Teacher', role: UserRole.TEACHER } })
  const teacherProfile = await prisma.teacherProfile.create({ data: { userId: teacher.id, departmentId: cse.id } })
  await prisma.teacherAssignment.create({
    data: {
      teacherId: teacherProfile.id,
      departmentId: cse.id,
      subjectId: subjectIntro.id,
      languageId: english.id,
      groupId: bscGroupY1A.id,
      academicYearId: year1.id,
      semesterId: semester1.id,
      academicOfferingId: offeringBscSem1.id,
    },
  })

  async function createStudent(name: string, departmentId = cse.id) {
    const user = await prisma.user.create({
      data: {
        email: `${name.toLowerCase()}@student.test`,
        password: hash('Student@123'),
        name,
        role: UserRole.STUDENT,
      },
    })
    const profile = await prisma.studentProfile.create({ data: { userId: user.id, departmentId } })
    return { user, profile }
  }

  const studentMap = {
    alice: await createStudent('Alice'),
    bob: await createStudent('Bob'),
    carol: await createStudent('Carol'),
    dave: await createStudent('Dave'),
    eve: await createStudent('Eve'),
    frank: await createStudent('Frank'),
    grace: await createStudent('Grace'),
    heidi: await createStudent('Heidi'),
    ivan: await createStudent('Ivan'),
    judy: await createStudent('Judy'),
    karl: await createStudent('Karl'),
    liam: await createStudent('Liam'),
    mallory: await createStudent('Mallory'),
    niaj: await createStudent('Niaj'),
    oscar: await createStudent('Oscar'),
    peggy: await createStudent('Peggy'),
    quentin: await createStudent('Quentin'),
    rita: await createStudent('Rita'),
    sybil: await createStudent('Sybil'),
    trent: await createStudent('Trent'),
    uma: await createStudent('Uma'),
    victor: await createStudent('Victor'),
    wendy: await createStudent('Wendy'),
    xavier: await createStudent('Xavier', eee.id),
    yvonne: await createStudent('Yvonne'),
    zara: await createStudent('Zara'),
  }

  const liveWindowStart = new Date(Date.now() - 60_000)
  const liveWindowEnd = new Date(Date.now() + 60 * 60 * 1000)
  const pastWindowStart = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const pastWindowEnd = new Date(Date.now() - 2 * 60 * 60 * 1000)

  const liveBscExam = await prisma.exam.create({
    data: {
      title: 'BSc Semester 1 Exam',
      teacherId: teacherProfile.id,
      departmentId: cse.id,
      subjectId: subjectIntro.id,
      languageId: english.id,
      groupId: bscGroupY1A.id,
      academicYearId: year1.id,
      semesterId: semester1.id,
      academicOfferingId: offeringBscSem1.id,
      questionType: QuestionType.MCQ,
      status: ExamStatus.LIVE,
      resultMode: ResultMode.AUTO,
      totalMarks: 50,
      passingMarks: 20,
      duration: 30,
      startTime: liveWindowStart,
      endTime: liveWindowEnd,
    },
  })
  const liveMscExam = await prisma.exam.create({
    data: {
      title: 'MSc Semester 1 Exam',
      teacherId: teacherProfile.id,
      departmentId: cse.id,
      subjectId: subjectAi.id,
      languageId: english.id,
      groupId: mscGroupA.id,
      academicYearId: year1.id,
      semesterId: semester1.id,
      academicOfferingId: offeringMscSem1.id,
      questionType: QuestionType.MCQ,
      status: ExamStatus.LIVE,
      resultMode: ResultMode.AUTO,
      totalMarks: 60,
      passingMarks: 24,
      duration: 45,
      startTime: liveWindowStart,
      endTime: liveWindowEnd,
    },
  })
  const completedBscFinalExam = await prisma.exam.create({
    data: {
      title: 'BSc Final Exam',
      teacherId: teacherProfile.id,
      departmentId: cse.id,
      subjectId: subjectCapstone.id,
      languageId: bangla.id,
      groupId: bscGroupY2A.id,
      academicYearId: year2.id,
      semesterId: semester2.id,
      academicOfferingId: offeringBscSem4.id,
      questionType: QuestionType.WRITTEN_ANSWER,
      status: ExamStatus.COMPLETED,
      resultMode: ResultMode.TEACHER_REVIEW,
      totalMarks: 100,
      passingMarks: 40,
      duration: 90,
      startTime: pastWindowStart,
      endTime: pastWindowEnd,
    },
  })
  const completedMscFinalExam = await prisma.exam.create({
    data: {
      title: 'MSc Final Exam',
      teacherId: teacherProfile.id,
      departmentId: cse.id,
      subjectId: subjectMl.id,
      languageId: english.id,
      groupId: mscGroupA.id,
      academicYearId: year1.id,
      semesterId: semester2.id,
      academicOfferingId: offeringMscSem2.id,
      questionType: QuestionType.WRITTEN_ANSWER,
      status: ExamStatus.COMPLETED,
      resultMode: ResultMode.TEACHER_REVIEW,
      totalMarks: 100,
      passingMarks: 40,
      duration: 90,
      startTime: pastWindowStart,
      endTime: pastWindowEnd,
    },
  })
  const liveEeeExam = await prisma.exam.create({
    data: {
      title: 'EEE Semester 1 Exam',
      teacherId: teacherProfile.id,
      departmentId: eee.id,
      subjectId: subjectCircuits.id,
      languageId: russian.id,
      groupId: eeeGroupA.id,
      academicYearId: year1.id,
      semesterId: semester1.id,
      academicOfferingId: offeringEeeSem1.id,
      questionType: QuestionType.MCQ,
      status: ExamStatus.LIVE,
      resultMode: ResultMode.AUTO,
      totalMarks: 50,
      passingMarks: 20,
      duration: 30,
      startTime: liveWindowStart,
      endTime: liveWindowEnd,
    },
  })

  return {
    UserRole,
    ResultStatus,
    StudentEnrollmentStatus: (await import('@prisma/client')).StudentEnrollmentStatus,
    StudentAcademicHistoryEventType: (await import('@prisma/client')).StudentAcademicHistoryEventType,
    StudentTransferType: (await import('@prisma/client')).StudentTransferType,
    StudentLeaveType: (await import('@prisma/client')).StudentLeaveType,
    users: { superAdmin, cseAdmin, eeeAdmin, teacher, teacherProfile },
    students: studentMap,
    academic: {
      years: { year1, year2, year3 },
      semesters: { semester1, semester2, semester3 },
      languages: { english, bangla, russian },
      departments: { cse, eee },
      sessions: { session2026, session2027, inactiveSession },
      departmentLanguages: { cseEnglish, cseBangla, cseInactiveLang, eeeRussian },
      programs: { bscProgram, inactiveProgram, mscProgram, eeeProgram },
      programYears: { bscYear1, bscYear2, bscYear3, mscYear1, eeeYear1 },
      programSemesters: { bscSem1, bscSem2, bscSem3, bscSem4, bscSem5, mscSem1, mscSem2, eeeSem1 },
      groups: { bscGroupY1A, bscGroupY1B, bscGroupY2A, bscGroupY3A, bscGroupOtherSession, bscInactiveGroup, mscGroupA, eeeGroupA },
      offerings: { offeringBscSem1, offeringBscSem1Y1B, offeringBscSem2, offeringBscSem3, offeringBscSem4, offeringMscSem1, offeringMscSem2, offeringEeeSem1 },
      subjects: { subjectIntro, subjectAlgo, subjectCapstone, subjectAi, subjectMl, subjectCircuits },
      exams: { liveBscExam, liveMscExam, completedBscFinalExam, completedMscFinalExam, liveEeeExam },
    },
  }
}

async function main() {
  const baseUrl = await getBaseDatabaseUrl()
  process.env.DATABASE_URL = withDatabaseName(baseUrl, '_phase3_tests')

  const prismaModule = await import('@prisma/client')
  const { PrismaClient } = prismaModule
  const lifecycle = await import('../../src/lib/student-lifecycle')
  const permissions = await import('../../src/lib/permissions')
  const validators = await import('../../src/lib/validators')

    const {
      createEnrollment,
      promoteStudent,
      transferStudent,
      placeStudentOnLeave,
      readmitStudent,
      graduateStudent,
      getActiveEnrollment,
    } = lifecycle
  const { studentCanAccessExam, teacherCanAccessAssignment } = permissions

  const prisma = new PrismaClient()
  const startedAt = Date.now()
  const tests: TestCase[] = []
  const categorySummary = new Map<string, CategorySummary>()
  let passed = 0
  let failed = 0
  const skipped = 0

  try {
    await cleanup(prisma as unknown as CleanupClient)
    const fx = await setupFixture(prisma)

    const actor = {
      actorUserId: fx.users.cseAdmin.id,
      actorRole: fx.UserRole.DEPARTMENT_ADMIN,
      sourceApi: 'phase3:test',
    } as const

    const bscEnrollmentInput = {
      departmentId: fx.academic.departments.cse.id,
      academicSessionId: fx.academic.sessions.session2026.id,
      programId: fx.academic.programs.bscProgram.id,
      programYearId: fx.academic.programYears.bscYear1.id,
      semesterId: fx.academic.semesters.semester1.id,
      programSemesterId: fx.academic.programSemesters.bscSem1.id,
      groupId: fx.academic.groups.bscGroupY1A.id,
      academicYearId: fx.academic.years.year1.id,
      departmentLanguageId: fx.academic.departmentLanguages.cseEnglish.id,
      languageId: fx.academic.languages.english.id,
      status: fx.StudentEnrollmentStatus.ACTIVE,
    }
    const bscPromotionInput = {
      departmentId: fx.academic.departments.cse.id,
      academicSessionId: fx.academic.sessions.session2026.id,
      programId: fx.academic.programs.bscProgram.id,
      programYearId: fx.academic.programYears.bscYear1.id,
      semesterId: fx.academic.semesters.semester2.id,
      programSemesterId: fx.academic.programSemesters.bscSem2.id,
      groupId: fx.academic.groups.bscGroupY1A.id,
      academicYearId: fx.academic.years.year1.id,
      departmentLanguageId: fx.academic.departmentLanguages.cseEnglish.id,
      languageId: fx.academic.languages.english.id,
    }
    const bscYear2Input = {
      departmentId: fx.academic.departments.cse.id,
      academicSessionId: fx.academic.sessions.session2026.id,
      programId: fx.academic.programs.bscProgram.id,
      programYearId: fx.academic.programYears.bscYear2.id,
      semesterId: fx.academic.semesters.semester1.id,
      programSemesterId: fx.academic.programSemesters.bscSem3.id,
      groupId: fx.academic.groups.bscGroupY2A.id,
      academicYearId: fx.academic.years.year2.id,
      departmentLanguageId: fx.academic.departmentLanguages.cseBangla.id,
      languageId: fx.academic.languages.bangla.id,
    }
    const bscFinalInput = {
      departmentId: fx.academic.departments.cse.id,
      academicSessionId: fx.academic.sessions.session2026.id,
      programId: fx.academic.programs.bscProgram.id,
      programYearId: fx.academic.programYears.bscYear2.id,
      semesterId: fx.academic.semesters.semester2.id,
      programSemesterId: fx.academic.programSemesters.bscSem4.id,
      groupId: fx.academic.groups.bscGroupY2A.id,
      academicYearId: fx.academic.years.year2.id,
      departmentLanguageId: fx.academic.departmentLanguages.cseBangla.id,
      languageId: fx.academic.languages.bangla.id,
      status: fx.StudentEnrollmentStatus.ACTIVE,
    }
    const mscEnrollmentInput = {
      departmentId: fx.academic.departments.cse.id,
      academicSessionId: fx.academic.sessions.session2026.id,
      programId: fx.academic.programs.mscProgram.id,
      programYearId: fx.academic.programYears.mscYear1.id,
      semesterId: fx.academic.semesters.semester1.id,
      programSemesterId: fx.academic.programSemesters.mscSem1.id,
      groupId: fx.academic.groups.mscGroupA.id,
      academicYearId: fx.academic.years.year1.id,
      departmentLanguageId: fx.academic.departmentLanguages.cseEnglish.id,
      languageId: fx.academic.languages.english.id,
      status: fx.StudentEnrollmentStatus.ACTIVE,
    }
    const mscFinalInput = {
      departmentId: fx.academic.departments.cse.id,
      academicSessionId: fx.academic.sessions.session2026.id,
      programId: fx.academic.programs.mscProgram.id,
      programYearId: fx.academic.programYears.mscYear1.id,
      semesterId: fx.academic.semesters.semester2.id,
      programSemesterId: fx.academic.programSemesters.mscSem2.id,
      groupId: fx.academic.groups.mscGroupA.id,
      academicYearId: fx.academic.years.year1.id,
      departmentLanguageId: fx.academic.departmentLanguages.cseEnglish.id,
      languageId: fx.academic.languages.english.id,
      status: fx.StudentEnrollmentStatus.ACTIVE,
    }
    const eeeEnrollmentInput = {
      departmentId: fx.academic.departments.eee.id,
      academicSessionId: fx.academic.sessions.session2026.id,
      programId: fx.academic.programs.eeeProgram.id,
      programYearId: fx.academic.programYears.eeeYear1.id,
      semesterId: fx.academic.semesters.semester1.id,
      programSemesterId: fx.academic.programSemesters.eeeSem1.id,
      groupId: fx.academic.groups.eeeGroupA.id,
      academicYearId: fx.academic.years.year1.id,
      departmentLanguageId: fx.academic.departmentLanguages.eeeRussian.id,
      languageId: fx.academic.languages.russian.id,
      status: fx.StudentEnrollmentStatus.ACTIVE,
    }

    async function countLifecycleRows(studentId: string) {
      const [enrollments, history, promotions, transfers, leaves, graduations] = await Promise.all([
        prisma.studentEnrollment.count({ where: { studentId } }),
        prisma.studentAcademicHistory.count({ where: { studentId } }),
        prisma.studentPromotion.count({ where: { studentId } }),
        prisma.studentTransfer.count({ where: { studentId } }),
        prisma.studentLeave.count({ where: { studentId } }),
        prisma.studentGraduation.count({ where: { studentId } }),
      ])
      return { enrollments, history, promotions, transfers, leaves, graduations }
    }

    async function createAttemptAndResult(studentProfileId: string, examId: string, status: import('@prisma/client').ResultStatus, marks = 88) {
      const attempt = await prisma.studentExamAttempt.create({
        data: {
          examId,
          studentId: studentProfileId,
          status: 'SUBMITTED',
          startedAt: new Date(Date.now() - 45 * 60 * 1000),
          submittedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      })
      await prisma.examResult.create({
        data: {
          examId,
          attemptId: attempt.id,
          studentId: studentProfileId,
          totalMarks: 100,
          marksObtained: marks,
          percentage: marks,
          isPassed: true,
          status,
          publishedAt: status === fx.ResultStatus.PUBLISHED ? new Date() : null,
        },
      })
    }

    async function addTest(id: string, category: string, name: string, run: () => Promise<void>) {
      tests.push({ id, category, name, run })
    }

    await addTest('ENR-001', 'Enrollment', 'Create first active BSc enrollment with history and legacy sync', async () => {
      const result = await createEnrollment(fx.students.alice.profile.id, { ...bscEnrollmentInput, notes: 'Alice BSc enrollment' }, actor)
      assert.equal(result.enrollment.status, fx.StudentEnrollmentStatus.ACTIVE)
      assert.equal(result.enrollment.isActive, true)
      assert.ok(result.legacySync.created > 0)
      const history = await prisma.studentAcademicHistory.findMany({ where: { studentId: fx.students.alice.profile.id }, orderBy: { occurredAt: 'asc' } })
      assert.ok(history.some((item) => item.eventType === fx.StudentAcademicHistoryEventType.ENROLLMENT))
      assert.ok(history.some((item) => item.eventType === fx.StudentAcademicHistoryEventType.LEGACY_SYNC))
    })

    await addTest('ENR-002', 'Enrollment', 'Reject second active enrollment without partial records', async () => {
      const before = await countLifecycleRows(fx.students.alice.profile.id)
      await assert.rejects(() => createEnrollment(fx.students.alice.profile.id, bscEnrollmentInput, actor), /active enrollment/i)
      const after = await countLifecycleRows(fx.students.alice.profile.id)
      assert.deepEqual(after, before)
    })

    await addTest('ENR-003', 'Enrollment', 'Create MSc enrollment', async () => {
      const result = await createEnrollment(fx.students.bob.profile.id, { ...mscEnrollmentInput, notes: 'Bob MSc enrollment' }, actor)
      assert.equal(result.enrollment.programId, fx.academic.programs.mscProgram.id)
      assert.ok(result.legacySync.created > 0)
    })

    await addTest('ENR-004', 'Enrollment', 'Reject missing student', async () => {
      await assert.rejects(() => createEnrollment('cmaaaaaaaaaaaaaaaaaaaaaaaa', bscEnrollmentInput, actor), /student not found/i)
    })

    await addTest('ENR-005', 'Enrollment', 'Reject missing program', async () => {
      await assert.rejects(() => createEnrollment(fx.students.carol.profile.id, { ...bscEnrollmentInput, programId: 'cmaaaaaaaaaaaaaaaaaaaaaaaa' }, actor), /program not found/i)
    })

    await addTest('ENR-006', 'Enrollment', 'Reject inactive program', async () => {
      await assert.rejects(() => createEnrollment(fx.students.carol.profile.id, {
        ...bscEnrollmentInput,
        programId: fx.academic.programs.inactiveProgram.id,
        programYearId: fx.academic.programYears.bscYear1.id,
      }, actor), /inactive/i)
    })

    await addTest('ENR-007', 'Enrollment', 'Reject invalid session', async () => {
      await assert.rejects(() => createEnrollment(fx.students.carol.profile.id, { ...bscEnrollmentInput, academicSessionId: 'cmaaaaaaaaaaaaaaaaaaaaaaaa' }, actor), /session not found/i)
    })

    await addTest('ENR-008', 'Enrollment', 'Reject inactive session', async () => {
      await assert.rejects(() => createEnrollment(fx.students.carol.profile.id, { ...bscEnrollmentInput, academicSessionId: fx.academic.sessions.inactiveSession.id }, actor), /inactive/i)
    })

    await addTest('ENR-009', 'Enrollment', 'Reject invalid program year', async () => {
      await assert.rejects(() => createEnrollment(fx.students.carol.profile.id, { ...bscEnrollmentInput, programYearId: fx.academic.programYears.mscYear1.id }, actor), /program year/i)
    })

    await addTest('ENR-010', 'Enrollment', 'Reject invalid semester', async () => {
      await assert.rejects(() => createEnrollment(fx.students.carol.profile.id, { ...bscEnrollmentInput, semesterId: 'cmaaaaaaaaaaaaaaaaaaaaaaaa' }, actor), /semester not found/i)
    })

    await addTest('ENR-011', 'Enrollment', 'Reject unsupported department language', async () => {
      await assert.rejects(() => createEnrollment(fx.students.carol.profile.id, {
        ...bscEnrollmentInput,
        departmentLanguageId: fx.academic.departmentLanguages.cseInactiveLang.id,
        languageId: fx.academic.languages.russian.id,
      }, actor), /inactive/i)
    })

    await addTest('ENR-012', 'Enrollment', 'Reject wrong group from another program', async () => {
      await assert.rejects(() => createEnrollment(fx.students.carol.profile.id, { ...bscEnrollmentInput, groupId: fx.academic.groups.mscGroupA.id }, actor), /selected program/i)
    })

    await addTest('ENR-013', 'Enrollment', 'Reject group from another session', async () => {
      await assert.rejects(() => createEnrollment(fx.students.carol.profile.id, { ...bscEnrollmentInput, groupId: fx.academic.groups.bscGroupOtherSession.id }, actor), /selected academic session/i)
    })

    await addTest('ENR-014', 'Enrollment', 'Reject inactive group', async () => {
      await assert.rejects(() => createEnrollment(fx.students.carol.profile.id, { ...bscEnrollmentInput, groupId: fx.academic.groups.bscInactiveGroup.id }, actor), /group is inactive/i)
    })

    await addTest('ENR-015', 'Enrollment', 'Reject cross-department enrollment', async () => {
      await assert.rejects(() => createEnrollment(fx.students.xavier.profile.id, bscEnrollmentInput, actor), /selected department/i)
    })

    await addTest('PRO-001', 'Promotion', 'Promote eligible BSc student and close prior enrollment safely', async () => {
      await createAttemptAndResult(fx.students.alice.profile.id, fx.academic.exams.liveBscExam.id, fx.ResultStatus.PUBLISHED, 84)
      const result = await promoteStudent(fx.students.alice.profile.id, { ...bscPromotionInput, notes: 'Alice promoted' }, actor)
      assert.equal(result.promotion.status, 'PROMOTED')
      const oldEnrollment = await prisma.studentEnrollment.findUnique({ where: { id: result.promotion.fromEnrollmentId } })
      assert.equal(oldEnrollment?.status, fx.StudentEnrollmentStatus.TRANSFERRED)
      assert.equal(oldEnrollment?.isActive, false)
      const active = await getActiveEnrollment(fx.students.alice.profile.id)
      assert.equal(active?.id, result.enrollment.id)
      assert.equal(active?.semesterId, fx.academic.semesters.semester2.id)
      const history = await prisma.studentAcademicHistory.findMany({ where: { studentId: fx.students.alice.profile.id } })
      assert.ok(history.some((item) => item.eventType === fx.StudentAcademicHistoryEventType.PROMOTION))
    })

    await addTest('PRO-002', 'Promotion', 'Reject unpublished results with no partial promotion', async () => {
      await createEnrollment(fx.students.carol.profile.id, bscEnrollmentInput, actor)
      const before = await countLifecycleRows(fx.students.carol.profile.id)
      await assert.rejects(() => promoteStudent(fx.students.carol.profile.id, bscPromotionInput, actor), /published/i)
      const after = await countLifecycleRows(fx.students.carol.profile.id)
      assert.deepEqual(after, before)
    })

    await addTest('PRO-003', 'Promotion', 'Reject missing current curriculum', async () => {
      const noCurriculumProgram = await prisma.academicProgram.create({
        data: {
          name: 'MSc Without Curriculum',
          code: 'MSC-NOCURR',
          degreeLevelId: fx.academic.programs.mscProgram.degreeLevelId,
          departmentId: fx.academic.departments.cse.id,
          durationYears: 1,
          totalSemesters: 2,
        },
      })
      const noCurrYear = await prisma.programYear.create({
        data: { programId: noCurriculumProgram.id, yearNumber: 1, name: 'NoCurr Year', code: 'NOC-Y1', sortOrder: 1 },
      })
      const noCurrSem1 = await prisma.programSemester.create({
        data: { programId: noCurriculumProgram.id, programYearId: noCurrYear.id, semesterId: fx.academic.semesters.semester1.id, semesterNumber: 1 },
      })
      const noCurrSem2 = await prisma.programSemester.create({
        data: { programId: noCurriculumProgram.id, programYearId: noCurrYear.id, semesterId: fx.academic.semesters.semester2.id, semesterNumber: 2 },
      })
      const noCurrGroup = await prisma.group.create({
        data: {
          name: 'MSC-NOCURR-A',
          code: 'MSC-NOCURR-A',
          academicYearId: fx.academic.years.year1.id,
          departmentId: fx.academic.departments.cse.id,
          programId: noCurriculumProgram.id,
          languageId: fx.academic.languages.english.id,
          departmentLanguageId: fx.academic.departmentLanguages.cseEnglish.id,
          academicSessionId: fx.academic.sessions.session2026.id,
          programYearId: noCurrYear.id,
          currentProgramSemesterId: noCurrSem1.id,
        },
      })
      await createEnrollment(fx.students.dave.profile.id, {
        departmentId: fx.academic.departments.cse.id,
        academicSessionId: fx.academic.sessions.session2026.id,
        programId: noCurriculumProgram.id,
        programYearId: noCurrYear.id,
        semesterId: fx.academic.semesters.semester1.id,
        programSemesterId: noCurrSem1.id,
        groupId: noCurrGroup.id,
        academicYearId: fx.academic.years.year1.id,
        departmentLanguageId: fx.academic.departmentLanguages.cseEnglish.id,
        languageId: fx.academic.languages.english.id,
        status: fx.StudentEnrollmentStatus.ACTIVE,
      }, actor)
      await assert.rejects(() => promoteStudent(fx.students.dave.profile.id, {
        departmentId: fx.academic.departments.cse.id,
        academicSessionId: fx.academic.sessions.session2026.id,
        programId: noCurriculumProgram.id,
        programYearId: noCurrYear.id,
        semesterId: fx.academic.semesters.semester2.id,
        programSemesterId: noCurrSem2.id,
        groupId: noCurrGroup.id,
        academicYearId: fx.academic.years.year1.id,
        departmentLanguageId: fx.academic.departmentLanguages.cseEnglish.id,
        languageId: fx.academic.languages.english.id,
      }, actor), /curriculum is missing/i)
    })

    await addTest('PRO-004', 'Promotion', 'Reject invalid next semester skip', async () => {
      await createEnrollment(fx.students.eve.profile.id, bscEnrollmentInput, actor)
      await assert.rejects(() => promoteStudent(fx.students.eve.profile.id, { ...bscYear2Input }, actor), /skip semester progression/i)
    })

    await addTest('PRO-005', 'Promotion', 'Reject promotion beyond configured duration', async () => {
      await createEnrollment(fx.students.frank.profile.id, bscFinalInput, actor)
      await createAttemptAndResult(fx.students.frank.profile.id, fx.academic.exams.completedBscFinalExam.id, fx.ResultStatus.PUBLISHED, 85)
      await assert.rejects(() => promoteStudent(fx.students.frank.profile.id, {
        departmentId: fx.academic.departments.cse.id,
        academicSessionId: fx.academic.sessions.session2026.id,
        programId: fx.academic.programs.bscProgram.id,
        programYearId: fx.academic.programYears.bscYear3.id,
        semesterId: fx.academic.semesters.semester3.id,
        programSemesterId: fx.academic.programSemesters.bscSem5.id,
        groupId: fx.academic.groups.bscGroupY3A.id,
        academicYearId: fx.academic.years.year3.id,
        departmentLanguageId: fx.academic.departmentLanguages.cseBangla.id,
        languageId: fx.academic.languages.bangla.id,
      }, actor), /configured program duration/i)
    })

    await addTest('PRO-006', 'Promotion', 'Reject student on leave', async () => {
      await createEnrollment(fx.students.grace.profile.id, bscEnrollmentInput, actor)
      await placeStudentOnLeave(fx.students.grace.profile.id, {
        leaveType: fx.StudentLeaveType.MEDICAL,
        startsAt: new Date('2026-03-01T00:00:00.000Z'),
        endsAt: new Date('2026-03-20T00:00:00.000Z'),
        reason: 'Medical leave',
      }, actor)
      await assert.rejects(() => promoteStudent(fx.students.grace.profile.id, bscPromotionInput, actor), /active enrollment not found/i)
    })

    await addTest('PRO-007', 'Promotion', 'Manual override records actor and failed eligibility checks', async () => {
      await createEnrollment(fx.students.heidi.profile.id, bscEnrollmentInput, actor)
      const result = await promoteStudent(fx.students.heidi.profile.id, {
        ...bscPromotionInput,
        manualOverride: true,
        overrideReason: 'Registrar override',
        notes: 'Override executed',
      }, actor)
      assert.equal(result.promotion.status, 'OVERRIDDEN')
      const audit = await prisma.activityLog.findFirst({
        where: { action: 'STUDENT_PROMOTION_OVERRIDE', userId: fx.users.cseAdmin.id },
        orderBy: { createdAt: 'desc' },
      })
      assert.ok(audit?.details)
      const details = JSON.parse(audit!.details as string)
      assert.equal(details.actorRole, fx.UserRole.DEPARTMENT_ADMIN)
      assert.equal(details.override, true)
      assert.ok(Array.isArray(details.originalValidationFailures))
      assert.ok(details.originalValidationFailures.length > 0)
    })

    await addTest('PRO-008', 'Promotion', 'Validator requires manual override reason', async () => {
      const parsed = validators.studentPromotionSchema.safeParse({
        ...bscPromotionInput,
        studentId: fx.students.heidi.profile.id,
        manualOverride: true,
      })
      assert.equal(parsed.success, false)
    })

    await addTest('TRN-001', 'Transfer', 'Valid group transfer closes source and preserves history', async () => {
      await createEnrollment(fx.students.ivan.profile.id, bscEnrollmentInput, actor)
      const result = await transferStudent(fx.students.ivan.profile.id, {
        ...bscEnrollmentInput,
        groupId: fx.academic.groups.bscGroupY1B.id,
        transferType: fx.StudentTransferType.GROUP,
        effectiveDate: new Date('2026-04-01T00:00:00.000Z'),
        reason: 'Section balancing',
      }, actor)
      const source = await prisma.studentEnrollment.findUnique({ where: { id: result.transfer.fromEnrollmentId } })
      assert.equal(source?.status, fx.StudentEnrollmentStatus.TRANSFERRED)
      assert.equal(source?.isActive, false)
      assert.equal(result.enrollment.groupId, fx.academic.groups.bscGroupY1B.id)
      const history = await prisma.studentAcademicHistory.findMany({ where: { studentId: fx.students.ivan.profile.id } })
      const transferHistory = history.find((item) => item.eventType === fx.StudentAcademicHistoryEventType.GROUP_TRANSFER)
      assert.ok(transferHistory)
      assert.equal(transferHistory?.fromGroupId, fx.academic.groups.bscGroupY1A.id)
      assert.equal(transferHistory?.toGroupId, fx.academic.groups.bscGroupY1B.id)
    })

    await addTest('TRN-002', 'Transfer', 'Valid program transfer creates target enrollment correctly', async () => {
      await createEnrollment(fx.students.judy.profile.id, bscEnrollmentInput, actor)
      const result = await transferStudent(fx.students.judy.profile.id, {
        ...mscEnrollmentInput,
        transferType: fx.StudentTransferType.PROGRAM,
        effectiveDate: new Date('2026-04-02T00:00:00.000Z'),
        reason: 'Program change',
      }, actor)
      assert.equal(result.enrollment.programId, fx.academic.programs.mscProgram.id)
      assert.equal((await getActiveEnrollment(fx.students.judy.profile.id))?.programId, fx.academic.programs.mscProgram.id)
    })

    await addTest('TRN-003', 'Transfer', 'Valid department transfer works across departments', async () => {
      await createEnrollment(fx.students.karl.profile.id, bscEnrollmentInput, actor)
      const result = await transferStudent(fx.students.karl.profile.id, {
        ...eeeEnrollmentInput,
        transferType: fx.StudentTransferType.DEPARTMENT,
        effectiveDate: new Date('2026-04-03T00:00:00.000Z'),
        reason: 'Department migration',
      }, actor)
      assert.equal(result.enrollment.departmentId, fx.academic.departments.eee.id)
      assert.equal(result.transfer.transferType, fx.StudentTransferType.DEPARTMENT)
    })

    await addTest('TRN-004', 'Transfer', 'Reject same-source-and-target group transfer', async () => {
      await createEnrollment(fx.students.liam.profile.id, bscEnrollmentInput, actor)
      await assert.rejects(() => transferStudent(fx.students.liam.profile.id, {
        ...bscEnrollmentInput,
        transferType: fx.StudentTransferType.GROUP,
      }, actor), /different target group/i)
    })

    await addTest('TRN-005', 'Transfer', 'Reject unsupported target language', async () => {
      await assert.rejects(() => transferStudent(fx.students.liam.profile.id, {
        ...bscEnrollmentInput,
        groupId: fx.academic.groups.bscGroupY1B.id,
        transferType: fx.StudentTransferType.GROUP,
        languageId: fx.academic.languages.russian.id,
        departmentLanguageId: fx.academic.departmentLanguages.cseInactiveLang.id,
      }, actor), /inactive|department language/i)
    })

    await addTest('LEV-001', 'Leave', 'Create medical leave and update enrollment state', async () => {
      await placeStudentOnLeave(fx.students.liam.profile.id, {
        leaveType: fx.StudentLeaveType.MEDICAL,
        startsAt: new Date('2026-05-01T00:00:00.000Z'),
        endsAt: new Date('2026-05-10T00:00:00.000Z'),
        reason: 'Medical leave',
      }, actor)
      const active = await getActiveEnrollment(fx.students.liam.profile.id)
      assert.equal(active, null)
      const latestEnrollment = await prisma.studentEnrollment.findFirst({
        where: { studentId: fx.students.liam.profile.id },
        orderBy: { updatedAt: 'desc' },
      })
      assert.equal(latestEnrollment?.status, fx.StudentEnrollmentStatus.LEAVE)
      const eligibility = await studentCanAccessExam(fx.students.liam.user.id, fx.academic.exams.liveBscExam.id)
      assert.equal(eligibility.allowed, false)
      assert.match(eligibility.reason ?? '', /leave/i)
    })

    await addTest('LEV-002', 'Leave', 'Create academic leave', async () => {
      await createEnrollment(fx.students.mallory.profile.id, bscEnrollmentInput, actor)
      const result = await placeStudentOnLeave(fx.students.mallory.profile.id, {
        leaveType: fx.StudentLeaveType.ACADEMIC,
        startsAt: new Date('2026-05-11T00:00:00.000Z'),
        endsAt: new Date('2026-06-01T00:00:00.000Z'),
        reason: 'Academic pause',
      }, actor)
      assert.equal(result.leave.leaveType, fx.StudentLeaveType.ACADEMIC)
    })

    await addTest('LEV-003', 'Leave', 'Create temporary leave', async () => {
      await createEnrollment(fx.students.niaj.profile.id, bscEnrollmentInput, actor)
      const result = await placeStudentOnLeave(fx.students.niaj.profile.id, {
        leaveType: fx.StudentLeaveType.TEMPORARY,
        startsAt: new Date('2026-06-05T00:00:00.000Z'),
        endsAt: new Date('2026-06-20T00:00:00.000Z'),
        reason: 'Temporary break',
      }, actor)
      assert.equal(result.leave.leaveType, fx.StudentLeaveType.TEMPORARY)
    })

    await addTest('LEV-004', 'Leave', 'Reject overlapping open leave', async () => {
      await assert.rejects(() => placeStudentOnLeave(fx.students.liam.profile.id, {
        leaveType: fx.StudentLeaveType.MEDICAL,
        startsAt: new Date('2026-05-05T00:00:00.000Z'),
        endsAt: new Date('2026-05-15T00:00:00.000Z'),
        reason: 'Overlap attempt',
      }, actor), /overlap|active enrollment not found/i)
    })

    await addTest('LEV-005', 'Leave', 'Reject leave end date before start date', async () => {
      await createEnrollment(fx.students.oscar.profile.id, bscEnrollmentInput, actor)
      await assert.rejects(() => placeStudentOnLeave(fx.students.oscar.profile.id, {
        leaveType: fx.StudentLeaveType.OTHER,
        startsAt: new Date('2026-07-10T00:00:00.000Z'),
        endsAt: new Date('2026-07-01T00:00:00.000Z'),
        reason: 'Invalid dates',
      }, actor), /after the start date/i)
    })

    await addTest('REA-001', 'Readmission', 'Readmit student from leave and restore valid exam eligibility', async () => {
      const result = await readmitStudent(fx.students.liam.profile.id, {
        ...bscEnrollmentInput,
        readmittedAt: new Date('2026-05-12T00:00:00.000Z'),
        approvalReason: 'Medical clearance',
      }, actor)
      assert.equal(result.enrollment.status, fx.StudentEnrollmentStatus.ACTIVE)
      const leave = await prisma.studentLeave.findFirst({ where: { studentId: fx.students.liam.profile.id }, orderBy: { createdAt: 'desc' } })
      assert.ok(leave?.readmittedAt)
      const eligibility = await studentCanAccessExam(fx.students.liam.user.id, fx.academic.exams.liveBscExam.id)
      assert.equal(eligibility.allowed, true)
    })

    await addTest('REA-002', 'Readmission', 'Reject student already active', async () => {
      await assert.rejects(() => readmitStudent(fx.students.liam.profile.id, bscEnrollmentInput, actor), /already has an active enrollment/i)
    })

    await addTest('REA-003', 'Readmission', 'Reject student without valid leave or inactive state', async () => {
      await assert.rejects(() => readmitStudent(fx.students.yvonne.profile.id, bscEnrollmentInput, actor), /prior leave or inactive enrollment/i)
    })

    await addTest('REA-004', 'Readmission', 'Readmit student into a validated new context', async () => {
      await readmitStudent(fx.students.mallory.profile.id, {
        ...bscYear2Input,
        readmittedAt: new Date('2026-06-02T00:00:00.000Z'),
        approvalReason: 'Advanced standing return',
      }, actor)
      const active = await getActiveEnrollment(fx.students.mallory.profile.id)
      assert.equal(active?.groupId, fx.academic.groups.bscGroupY2A.id)
    })

    await addTest('GRD-001', 'Graduation', 'Graduate eligible BSc student and close active progression', async () => {
      await createEnrollment(fx.students.peggy.profile.id, bscFinalInput, actor)
      await createAttemptAndResult(fx.students.peggy.profile.id, fx.academic.exams.completedBscFinalExam.id, fx.ResultStatus.PUBLISHED, 95)
      const result = await graduateStudent(fx.students.peggy.profile.id, {
        graduatedAt: new Date('2026-08-01T00:00:00.000Z'),
        finalCgpa: 3.92,
        degreeClassification: 'First Class',
        certificateNumber: 'CERT-PEGGY-001',
        degreeAwarded: 'BSc in Computer Science',
        notes: 'BSc graduation',
      }, actor)
      assert.equal(result.enrollment.isActive, false)
      assert.equal(result.enrollment.status, fx.StudentEnrollmentStatus.GRADUATED)
      assert.equal(await getActiveEnrollment(fx.students.peggy.profile.id), null)
      const history = await prisma.studentAcademicHistory.findMany({ where: { studentId: fx.students.peggy.profile.id } })
      assert.ok(history.some((item) => item.eventType === fx.StudentAcademicHistoryEventType.GRADUATION))
    })

    await addTest('GRD-002', 'Graduation', 'Graduate eligible MSc student', async () => {
      await createEnrollment(fx.students.quentin.profile.id, mscFinalInput, actor)
      await createAttemptAndResult(fx.students.quentin.profile.id, fx.academic.exams.completedMscFinalExam.id, fx.ResultStatus.PUBLISHED, 91)
      const result = await graduateStudent(fx.students.quentin.profile.id, {
        graduatedAt: new Date('2026-08-03T00:00:00.000Z'),
        finalCgpa: 3.78,
        certificateNumber: 'CERT-QUENTIN-001',
        degreeAwarded: 'MSc in Applied AI',
      }, actor)
      assert.equal(result.graduation.degreeAwarded, 'MSc in Applied AI')
    })

    await addTest('GRD-003', 'Graduation', 'Reject duplicate graduation', async () => {
      await assert.rejects(() => graduateStudent(fx.students.peggy.profile.id, {
        graduatedAt: new Date('2026-08-02T00:00:00.000Z'),
        degreeAwarded: 'BSc in Computer Science',
      }, actor), /active enrollment not found|graduation record already exists/i)
    })

    await addTest('GRD-004', 'Graduation', 'Reject unpublished results for graduation', async () => {
      await createEnrollment(fx.students.rita.profile.id, bscFinalInput, actor)
      await assert.rejects(() => graduateStudent(fx.students.rita.profile.id, {
        graduatedAt: new Date('2026-08-04T00:00:00.000Z'),
        degreeAwarded: 'BSc in Computer Science',
      }, actor), /published/i)
    })

    await addTest('GRD-005', 'Graduation', 'Reject active-leave graduation', async () => {
      await createEnrollment(fx.students.sybil.profile.id, bscFinalInput, actor)
      await placeStudentOnLeave(fx.students.sybil.profile.id, {
        leaveType: fx.StudentLeaveType.ACADEMIC,
        startsAt: new Date('2026-08-05T00:00:00.000Z'),
        endsAt: new Date('2026-08-20T00:00:00.000Z'),
        reason: 'Leave before completion',
      }, actor)
      await assert.rejects(() => graduateStudent(fx.students.sybil.profile.id, {
        graduatedAt: new Date('2026-08-06T00:00:00.000Z'),
        degreeAwarded: 'BSc in Computer Science',
      }, actor), /active enrollment not found|active leave/i)
    })

    await addTest('GRD-006', 'Graduation', 'Validator rejects invalid CGPA range', async () => {
      const parsed = validators.studentGraduationSchema.safeParse({
        studentId: fx.students.peggy.profile.id,
        graduatedAt: new Date().toISOString(),
        finalCgpa: 4.5,
        degreeAwarded: 'BSc in Computer Science',
      })
      assert.equal(parsed.success, false)
    })

    await addTest('LEG-001', 'Legacy', 'Legacy-only student fallback allows exam access without enrollment', async () => {
      await prisma.studentSubject.create({
        data: {
          studentId: fx.students.trent.profile.id,
          subjectId: fx.academic.subjects.subjectIntro.id,
          languageId: fx.academic.languages.english.id,
          groupId: fx.academic.groups.bscGroupY1A.id,
          academicYearId: fx.academic.years.year1.id,
          semesterId: fx.academic.semesters.semester1.id,
          academicOfferingId: fx.academic.offerings.offeringBscSem1.id,
        },
      })
      const eligibility = await studentCanAccessExam(fx.students.trent.user.id, fx.academic.exams.liveBscExam.id)
      assert.equal(eligibility.allowed, true)
    })

    await addTest('LEG-002', 'Legacy', 'Active enrollment takes precedence over conflicting legacy scope', async () => {
      await createEnrollment(fx.students.uma.profile.id, {
        ...bscEnrollmentInput,
        groupId: fx.academic.groups.bscGroupY1B.id,
      }, actor)
      await prisma.studentSubject.create({
        data: {
          studentId: fx.students.uma.profile.id,
          subjectId: fx.academic.subjects.subjectIntro.id,
          languageId: fx.academic.languages.english.id,
          groupId: fx.academic.groups.bscGroupY1A.id,
          academicYearId: fx.academic.years.year1.id,
          semesterId: fx.academic.semesters.semester1.id,
          academicOfferingId: fx.academic.offerings.offeringBscSem1.id,
        },
      })
      const eligibility = await studentCanAccessExam(fx.students.uma.user.id, fx.academic.exams.liveBscExam.id)
      assert.equal(eligibility.allowed, false)
      assert.match(eligibility.reason ?? '', /active enrollment/i)
    })

    await addTest('LEG-003', 'Legacy', 'Transferred student old scope denied and target scope allowed', async () => {
      await createEnrollment(fx.students.victor.profile.id, bscEnrollmentInput, actor)
      await transferStudent(fx.students.victor.profile.id, {
        ...bscEnrollmentInput,
        groupId: fx.academic.groups.bscGroupY1B.id,
        transferType: fx.StudentTransferType.GROUP,
      }, actor)
      const oldScope = await studentCanAccessExam(fx.students.victor.user.id, fx.academic.exams.liveBscExam.id)
      assert.equal(oldScope.allowed, false)
      const targetExam = await prisma.exam.create({
        data: {
          title: 'BSc Y1B Exam',
          teacherId: fx.users.teacherProfile.id,
          departmentId: fx.academic.departments.cse.id,
          subjectId: fx.academic.subjects.subjectIntro.id,
          languageId: fx.academic.languages.english.id,
          groupId: fx.academic.groups.bscGroupY1B.id,
          academicYearId: fx.academic.years.year1.id,
          semesterId: fx.academic.semesters.semester1.id,
          academicOfferingId: fx.academic.offerings.offeringBscSem1Y1B.id,
          questionType: 'MCQ',
          status: 'LIVE',
          resultMode: 'AUTO',
          totalMarks: 50,
          passingMarks: 20,
          duration: 30,
          startTime: new Date(Date.now() - 60_000),
          endTime: new Date(Date.now() + 60 * 60 * 1000),
        },
      })
      const targetScope = await studentCanAccessExam(fx.students.victor.user.id, targetExam.id)
      assert.equal(targetScope.allowed, true)
    })

    await addTest('LEG-004', 'Legacy', 'Teacher assignment remains usable for legacy scope', async () => {
      const allowed = await teacherCanAccessAssignment(
        { userId: fx.users.teacher.id, role: fx.UserRole.TEACHER },
        {
          academicOfferingId: fx.academic.offerings.offeringBscSem1.id,
          subjectId: fx.academic.subjects.subjectIntro.id,
          languageId: fx.academic.languages.english.id,
          groupId: fx.academic.groups.bscGroupY1A.id,
          academicYearId: fx.academic.years.year1.id,
          semesterId: fx.academic.semesters.semester1.id,
        },
      )
      assert.equal(allowed, true)
    })

    await addTest('ELG-001', 'Exam Eligibility', 'Wrong department exam access is denied', async () => {
      await createEnrollment(fx.students.wendy.profile.id, bscEnrollmentInput, actor)
      const eligibility = await studentCanAccessExam(fx.students.wendy.user.id, fx.academic.exams.liveEeeExam.id)
      assert.equal(eligibility.allowed, false)
      assert.match(eligibility.reason ?? '', /department mismatch/i)
    })

    await addTest('ELG-002', 'Exam Eligibility', 'Graduated student cannot start a new live exam', async () => {
      const newLiveFinal = await prisma.exam.create({
        data: {
          title: 'Post Graduation Live Exam',
          teacherId: fx.users.teacherProfile.id,
          departmentId: fx.academic.departments.cse.id,
          subjectId: fx.academic.subjects.subjectCapstone.id,
          languageId: fx.academic.languages.bangla.id,
          groupId: fx.academic.groups.bscGroupY2A.id,
          academicYearId: fx.academic.years.year2.id,
          semesterId: fx.academic.semesters.semester2.id,
          academicOfferingId: fx.academic.offerings.offeringBscSem4.id,
          questionType: 'MCQ',
          status: 'LIVE',
          resultMode: 'AUTO',
          totalMarks: 50,
          passingMarks: 20,
          duration: 30,
          startTime: new Date(Date.now() - 60_000),
          endTime: new Date(Date.now() + 60 * 60 * 1000),
        },
      })
      const eligibility = await studentCanAccessExam(fx.students.peggy.user.id, newLiveFinal.id)
      assert.equal(eligibility.allowed, false)
      assert.match(eligibility.reason ?? '', /graduated/i)
    })

    await addTest('ELG-003', 'Exam Eligibility', 'Transferred student old scope is denied while target scope remains allowed', async () => {
      const oldScope = await studentCanAccessExam(fx.students.victor.user.id, fx.academic.exams.liveBscExam.id)
      assert.equal(oldScope.allowed, false)
      assert.match(oldScope.reason ?? '', /active enrollment/i)

      const liveBscY1BExam = await prisma.exam.create({
        data: {
          title: 'Victor Target Scope Exam',
          teacherId: fx.users.teacherProfile.id,
          departmentId: fx.academic.departments.cse.id,
          subjectId: fx.academic.subjects.subjectIntro.id,
          languageId: fx.academic.languages.english.id,
          groupId: fx.academic.groups.bscGroupY1B.id,
          academicYearId: fx.academic.years.year1.id,
          semesterId: fx.academic.semesters.semester1.id,
          academicOfferingId: fx.academic.offerings.offeringBscSem1Y1B.id,
          questionType: 'MCQ',
          status: 'LIVE',
          resultMode: 'AUTO',
          totalMarks: 50,
          passingMarks: 20,
          duration: 30,
          startTime: new Date(Date.now() - 60_000),
          endTime: new Date(Date.now() + 60 * 60 * 1000),
        },
      })

      const targetScope = await studentCanAccessExam(fx.students.victor.user.id, liveBscY1BExam.id)
      assert.equal(targetScope.allowed, true)
    })

    await addTest('ELG-004', 'Exam Eligibility', 'Student on active leave cannot access a new live exam', async () => {
      const activeLeaveExam = await prisma.exam.create({
        data: {
          title: 'Active Leave Access Check',
          teacherId: fx.users.teacherProfile.id,
          departmentId: fx.academic.departments.cse.id,
          subjectId: fx.academic.subjects.subjectCapstone.id,
          languageId: fx.academic.languages.bangla.id,
          groupId: fx.academic.groups.bscGroupY2A.id,
          academicYearId: fx.academic.years.year2.id,
          semesterId: fx.academic.semesters.semester2.id,
          academicOfferingId: fx.academic.offerings.offeringBscSem4.id,
          questionType: 'MCQ',
          status: 'LIVE',
          resultMode: 'AUTO',
          totalMarks: 50,
          passingMarks: 20,
          duration: 30,
          startTime: new Date(Date.now() - 60_000),
          endTime: new Date(Date.now() + 60 * 60 * 1000),
        },
      })

      const eligibility = await studentCanAccessExam(fx.students.sybil.user.id, activeLeaveExam.id)
      assert.equal(eligibility.allowed, false)
      assert.match(eligibility.reason ?? '', /leave/i)
    })

    for (const test of tests) {
      const category = categorySummary.get(test.category) ?? { total: 0, passed: 0, failed: 0, skipped: 0 }
      category.total += 1
      categorySummary.set(test.category, category)

      try {
        await test.run()
        passed += 1
        category.passed += 1
        console.log(`PASS ${test.id} [${test.category}] ${test.name}`)
      } catch (error) {
        failed += 1
        category.failed += 1
        console.error(`FAIL ${test.id} [${test.category}] ${test.name}`)
        console.error(error)
      }
    }

    const durationMs = Date.now() - startedAt
    console.log('')
    console.log('Phase 3 lifecycle test summary')
    console.log(`Total tests: ${tests.length}`)
    console.log(`Passed: ${passed}`)
    console.log(`Failed: ${failed}`)
    console.log(`Skipped: ${skipped}`)
    console.log(`DurationMs: ${durationMs}`)
    console.log('Category totals:')
    for (const [category, stats] of categorySummary.entries()) {
      console.log(`- ${category}: total=${stats.total}, passed=${stats.passed}, failed=${stats.failed}, skipped=${stats.skipped}`)
    }

    if (failed > 0) {
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
