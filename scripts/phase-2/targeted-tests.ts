import assert from 'assert'
import { readFile } from 'fs/promises'

type CleanupClient = {
  activityLog: { deleteMany: () => Promise<unknown> }
  notification: { deleteMany: () => Promise<unknown> }
  courseworkSubmission: { deleteMany: () => Promise<unknown> }
  courseworkAccessRequest: { deleteMany: () => Promise<unknown> }
  courseworkAssignment: { deleteMany: () => Promise<unknown> }
  courseworkRule: { deleteMany: () => Promise<unknown> }
  ebookUpload: { deleteMany: () => Promise<unknown> }
  resultReview: { deleteMany: () => Promise<unknown> }
  examResult: { deleteMany: () => Promise<unknown> }
  studentAnswer: { deleteMany: () => Promise<unknown> }
  studentExamAttempt: { deleteMany: () => Promise<unknown> }
  examSession: { deleteMany: () => Promise<unknown> }
  examQuestion: { deleteMany: () => Promise<unknown> }
  questionOption: { deleteMany: () => Promise<unknown> }
  question: { deleteMany: () => Promise<unknown> }
  exam: { deleteMany: () => Promise<unknown> }
  teacherAssignment: { deleteMany: () => Promise<unknown> }
  studentSubject: { deleteMany: () => Promise<unknown> }
  academicOffering: { deleteMany: () => Promise<unknown> }
  programSubject: { deleteMany: () => Promise<unknown> }
  programSemester: { deleteMany: () => Promise<unknown> }
  programYear: { deleteMany: () => Promise<unknown> }
  academicSession: { deleteMany: () => Promise<unknown> }
  departmentLanguage: { deleteMany: () => Promise<unknown> }
  academicProgram: { deleteMany: () => Promise<unknown> }
  degreeLevel: { deleteMany: () => Promise<unknown> }
  studentProfile: { deleteMany: () => Promise<unknown> }
  teacherProfile: { deleteMany: () => Promise<unknown> }
  subject: { deleteMany: () => Promise<unknown> }
  language: { deleteMany: () => Promise<unknown> }
  group: { deleteMany: () => Promise<unknown> }
  semester: { deleteMany: () => Promise<unknown> }
  academicYear: { deleteMany: () => Promise<unknown> }
  department: { deleteMany: () => Promise<unknown> }
  user: { deleteMany: () => Promise<unknown> }
}

async function getBaseDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const envRaw = await readFile('.env', 'utf8')
  const match = envRaw.match(/^DATABASE_URL="?([^"\r\n]+)"?/m)
  if (!match) {
    throw new Error('DATABASE_URL is required for targeted Phase 2 tests.')
  }

  return match[1]
}

function withDatabaseName(databaseUrl: string, suffix: string) {
  const [base, query = ''] = databaseUrl.split('?')
  const dbName = base.slice(base.lastIndexOf('/') + 1)
  const root = base.slice(0, base.lastIndexOf('/') + 1)
  return `${root}${dbName}${suffix}${query ? `?${query}` : ''}`
}

async function cleanup(prisma: CleanupClient) {
  await prisma.activityLog.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.courseworkSubmission.deleteMany()
  await prisma.courseworkAccessRequest.deleteMany()
  await prisma.courseworkAssignment.deleteMany()
  await prisma.courseworkRule.deleteMany()
  await prisma.ebookUpload.deleteMany()
  await prisma.resultReview.deleteMany()
  await prisma.examResult.deleteMany()
  await prisma.studentAnswer.deleteMany()
  await prisma.studentExamAttempt.deleteMany()
  await prisma.examSession.deleteMany()
  await prisma.examQuestion.deleteMany()
  await prisma.questionOption.deleteMany()
  await prisma.question.deleteMany()
  await prisma.exam.deleteMany()
  await prisma.teacherAssignment.deleteMany()
  await prisma.studentSubject.deleteMany()
  await prisma.academicOffering.deleteMany()
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
  await prisma.group.deleteMany()
  await prisma.semester.deleteMany()
  await prisma.academicYear.deleteMany()
  await prisma.department.deleteMany()
  await prisma.user.deleteMany()
}

function canAccessDepartment(scope: { isSuperAdmin: boolean; managedDepartmentIds: string[] }, departmentId: string) {
  return scope.isSuperAdmin || scope.managedDepartmentIds.includes(departmentId)
}

async function main() {
  const baseUrl = await getBaseDatabaseUrl()

  process.env.DATABASE_URL = withDatabaseName(baseUrl, '_phase2_tests')

  const { PrismaClient, UserRole } = await import('@prisma/client')
  const { validateAcademicContext } = await import('../../src/lib/academic-scope')
  const { studentCanAccessExam } = await import('../../src/lib/permissions')
  const { getFilteredFieldOptions, reconcileDependentSelections } = await import('../../src/components/admin/simple-entity-form')
  const { resolveTeacherAssignment, resolveStudentSubject, validateManualMappings } = await import('./backfill-support')

  const prisma = new PrismaClient()

  try {
    await cleanup(prisma)

    const year1 = await prisma.academicYear.create({ data: { name: 'Year 1', year: 1 } })
    const year2 = await prisma.academicYear.create({ data: { name: 'Year 2', year: 2 } })
    const semester1 = await prisma.semester.create({ data: { name: 'Semester 1', number: 1 } })
    const semester2 = await prisma.semester.create({ data: { name: 'Semester 2', number: 2 } })
    const english = await prisma.language.create({ data: { name: 'English', code: 'EN' } })
    const russian = await prisma.language.create({ data: { name: 'Russian', code: 'RU' } })
    const cse = await prisma.department.create({ data: { name: 'Computer Science', code: 'CSE' } })
    const eee = await prisma.department.create({ data: { name: 'Electrical', code: 'EEE' } })
    const degree = await prisma.degreeLevel.create({ data: { name: 'Bachelor of Science', code: 'BSC', defaultYears: 4, sortOrder: 1 } })
    const session = await prisma.academicSession.create({
      data: {
        name: '2026-2027',
        code: '2026-2027',
        startDate: new Date('2026-09-01T00:00:00.000Z'),
        endDate: new Date('2027-08-31T23:59:59.999Z'),
        isCurrent: true,
      },
    })
    const cseEnglish = await prisma.departmentLanguage.create({ data: { departmentId: cse.id, languageId: english.id } })
    await prisma.departmentLanguage.create({ data: { departmentId: eee.id, languageId: russian.id } })
    const program = await prisma.academicProgram.create({
      data: {
        name: 'BSc in Computer Science',
        code: 'BSC-CS',
        degreeLevelId: degree.id,
        departmentId: cse.id,
        durationYears: 4,
        totalSemesters: 8,
      },
    })
    const programYear1 = await prisma.programYear.create({
      data: { programId: program.id, yearNumber: 1, name: 'BSc Year 1', code: 'BSC-Y1', sortOrder: 1 },
    })
    const programYear2 = await prisma.programYear.create({
      data: { programId: program.id, yearNumber: 2, name: 'BSc Year 2', code: 'BSC-Y2', sortOrder: 2 },
    })
    const programSemester1 = await prisma.programSemester.create({
      data: { programId: program.id, programYearId: programYear1.id, semesterId: semester1.id, semesterNumber: 1 },
    })
    const programSemester3 = await prisma.programSemester.create({
      data: { programId: program.id, programYearId: programYear2.id, semesterId: semester1.id, semesterNumber: 3 },
    })
    const ds = await prisma.subject.create({ data: { name: 'Data Structures', code: 'CSE-201', departmentId: cse.id } })
    const dbms = await prisma.subject.create({ data: { name: 'Database Systems', code: 'CSE-301', departmentId: cse.id } })
    const programSubject = await prisma.programSubject.create({
      data: {
        programId: program.id,
        programYearId: programYear1.id,
        semesterId: semester1.id,
        programSemesterId: programSemester1.id,
        subjectId: ds.id,
      },
    })
    await prisma.programSubject.create({
      data: {
        programId: program.id,
        programYearId: programYear2.id,
        semesterId: semester1.id,
        programSemesterId: programSemester3.id,
        subjectId: dbms.id,
      },
    })
    const validGroup = await prisma.group.create({
      data: {
        name: 'BSC-CS-11R',
        code: 'BSC-CS-11R',
        academicYearId: year1.id,
        departmentId: cse.id,
        programId: program.id,
        languageId: english.id,
        departmentLanguageId: cseEnglish.id,
        academicSessionId: session.id,
        programYearId: programYear1.id,
        currentProgramSemesterId: programSemester1.id,
      },
    })
    const wrongGroup = await prisma.group.create({
      data: {
        name: 'BSC-CS-21R',
        code: 'BSC-CS-21R',
        academicYearId: year2.id,
        departmentId: cse.id,
        programId: program.id,
        languageId: english.id,
        departmentLanguageId: cseEnglish.id,
        academicSessionId: session.id,
        programYearId: programYear2.id,
        currentProgramSemesterId: programSemester3.id,
      },
    })
    const offering = await prisma.academicOffering.create({
      data: {
        academicSessionId: session.id,
        programId: program.id,
        departmentId: cse.id,
        departmentLanguageId: cseEnglish.id,
        languageId: english.id,
        programYearId: programYear1.id,
        semesterId: semester1.id,
        programSemesterId: programSemester1.id,
        groupId: validGroup.id,
        subjectId: ds.id,
        programSubjectId: programSubject.id,
        status: 'ACTIVE',
      },
      include: {
        academicSession: true,
        program: true,
        department: true,
        language: true,
        programYear: true,
        semester: true,
        group: true,
        subject: true,
      },
    })

    await validateAcademicContext({
      academicSessionId: session.id,
      programId: program.id,
      departmentId: cse.id,
      languageId: english.id,
      departmentLanguageId: cseEnglish.id,
      programYearId: programYear1.id,
      semesterId: semester1.id,
      programSemesterId: programSemester1.id,
      groupId: validGroup.id,
      subjectId: ds.id,
      programSubjectId: programSubject.id,
    })

    await assert.rejects(
      () =>
        validateAcademicContext({
          academicSessionId: session.id,
          programId: program.id,
          departmentId: cse.id,
          languageId: russian.id,
          programYearId: programYear1.id,
          semesterId: semester1.id,
          groupId: validGroup.id,
          subjectId: ds.id,
        }),
      /Department does not support the selected language/
    )

    await assert.rejects(
      () =>
        validateAcademicContext({
          academicSessionId: session.id,
          programId: program.id,
          departmentId: cse.id,
          languageId: english.id,
          programYearId: programYear1.id,
          semesterId: semester1.id,
          groupId: wrongGroup.id,
          subjectId: ds.id,
        }),
      /Group belongs to a different program year/
    )

    await assert.rejects(
      () =>
        validateAcademicContext({
          academicSessionId: session.id,
          programId: program.id,
          departmentId: cse.id,
          languageId: english.id,
          programYearId: programYear1.id,
          semesterId: semester2.id,
          groupId: validGroup.id,
          subjectId: ds.id,
        }),
      /Semester is not mapped to the selected program year/
    )

    const teacherUser = await prisma.user.create({
      data: { email: 'teacher@test.local', password: 'x', name: 'Teacher', role: UserRole.TEACHER },
    })
    const teacherProfile = await prisma.teacherProfile.create({ data: { userId: teacherUser.id, departmentId: cse.id } })
    const studentUser = await prisma.user.create({
      data: { email: 'student@test.local', password: 'x', name: 'Student', role: UserRole.STUDENT },
    })
    const studentProfile = await prisma.studentProfile.create({ data: { userId: studentUser.id, departmentId: cse.id } })
    const assignment = await prisma.teacherAssignment.create({
      data: {
        teacherId: teacherProfile.id,
        departmentId: cse.id,
        subjectId: ds.id,
        languageId: english.id,
        groupId: validGroup.id,
        academicYearId: year1.id,
        semesterId: semester1.id,
      },
      include: {
        teacher: { include: { user: true } },
        department: true,
        subject: true,
        language: true,
        group: true,
        academicYear: true,
      },
    })
    const studentSubject = await prisma.studentSubject.create({
      data: {
        studentId: studentProfile.id,
        subjectId: ds.id,
        languageId: english.id,
        groupId: validGroup.id,
        academicYearId: year1.id,
        semesterId: semester1.id,
      },
      include: {
        student: { include: { user: true, department: true } },
        subject: true,
        language: true,
        group: true,
        academicYear: true,
      },
    })

    const resolvedAssignment = resolveTeacherAssignment(assignment, [offering], {
      teacherAssignments: { map: {}, accept: {} },
      studentSubjects: { map: {}, accept: {} },
    })
    assert.equal(resolvedAssignment.resolutionStatus, 'MAPPED')
    assert.equal(resolvedAssignment.selectedOfferingId, offering.id)

    const resolvedStudentSubject = resolveStudentSubject(studentSubject, [offering], {
      teacherAssignments: { map: {}, accept: {} },
      studentSubjects: { map: {}, accept: {} },
    })
    assert.equal(resolvedStudentSubject.resolutionStatus, 'MAPPED')
    assert.equal(resolvedStudentSubject.selectedOfferingId, offering.id)

    await validateManualMappings(
      prisma,
      [resolvedAssignment, resolvedStudentSubject],
      [offering],
      {
        teacherAssignments: { map: { [assignment.id]: offering.id }, accept: {} },
        studentSubjects: { map: { [studentSubject.id]: offering.id }, accept: {} },
      }
    )

    const now = new Date()
    const legacyExam = await prisma.exam.create({
      data: {
        title: 'Legacy Access Test',
        teacherId: teacherProfile.id,
        departmentId: cse.id,
        subjectId: ds.id,
        languageId: english.id,
        groupId: validGroup.id,
        academicYearId: year1.id,
        semesterId: semester1.id,
        questionType: 'MCQ',
        status: 'SCHEDULED',
        resultMode: 'AUTO',
        totalMarks: 10,
        passingMarks: 5,
        duration: 30,
        startTime: new Date(now.getTime() - 10 * 60 * 1000),
        endTime: new Date(now.getTime() + 10 * 60 * 1000),
      },
    })
    const offeringExam = await prisma.exam.create({
      data: {
        title: 'Offering Access Test',
        teacherId: teacherProfile.id,
        departmentId: cse.id,
        subjectId: ds.id,
        languageId: english.id,
        groupId: validGroup.id,
        academicYearId: year1.id,
        semesterId: semester1.id,
        academicOfferingId: offering.id,
        questionType: 'MCQ',
        status: 'SCHEDULED',
        resultMode: 'AUTO',
        totalMarks: 10,
        passingMarks: 5,
        duration: 30,
        startTime: new Date(now.getTime() - 10 * 60 * 1000),
        endTime: new Date(now.getTime() + 10 * 60 * 1000),
      },
    })

    assert.deepEqual(await studentCanAccessExam(studentUser.id, legacyExam.id), { allowed: true })
    assert.deepEqual(await studentCanAccessExam(studentUser.id, offeringExam.id), { allowed: true })

    assert.equal(
      canAccessDepartment({ isSuperAdmin: false, managedDepartmentIds: [cse.id] }, eee.id),
      false
    )

    const field = {
      key: 'programYearId',
      label: 'Program Year',
      type: 'select' as const,
      dependsOn: ['programId'],
      options: [
        { value: 'year-1', label: 'Year 1', meta: { programId: 'program-a' } },
        { value: 'year-2', label: 'Year 2', meta: { programId: 'program-b' } },
      ],
    }

    assert.deepEqual(getFilteredFieldOptions(field, { programId: 'program-a' }).map((item) => item.value), ['year-1'])
    assert.deepEqual(
      reconcileDependentSelections([field], { programId: 'program-a', programYearId: 'year-2' }),
      { programId: 'program-a', programYearId: '' }
    )

    console.log('Phase 2 targeted tests: PASS')
  } finally {
    await cleanup(prisma)
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('Phase 2 targeted tests failed:', error)
  process.exit(1)
})
