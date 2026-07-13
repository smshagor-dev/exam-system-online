/**
 * ExamFlow Pro - Database Seed
 * Run: npx ts-node --project tsconfig.seed.json prisma/seed.ts
 */

import {
  PrismaClient,
  UserRole,
  QuestionType,
  ExamStatus,
  ResultMode,
  TeacherSubstitutionStatus,
  TeachingAssignmentRoleType,
  TeachingAssignmentStatus,
} from '@prisma/client/index'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding ExamFlow Pro database...')

  // ─── Clean slate ────────────────────────────────────────────
  await prisma.activityLog.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.courseworkModerationDecision.deleteMany()
  await prisma.courseworkFeedbackAttachment.deleteMany()
  await prisma.courseworkGradeCriterionScore.deleteMany()
  await prisma.courseworkGrade.deleteMany()
  await prisma.courseworkAttemptAttachment.deleteMany()
  await prisma.courseworkAttempt.deleteMany()
  await prisma.courseworkPublicationTarget.deleteMany()
  await prisma.courseworkExtensionRequest.deleteMany()
  await prisma.courseworkPublication.deleteMany()
  await prisma.courseworkRubricLevel.deleteMany()
  await prisma.courseworkRubricCriterion.deleteMany()
  await prisma.courseworkRubric.deleteMany()
  await prisma.courseworkTemplateVersion.deleteMany()
  await prisma.courseworkTemplate.deleteMany()
  await prisma.courseworkSubmission.deleteMany()
  await prisma.courseworkAccessRequest.deleteMany()
  await prisma.courseworkAssignmentTranslation.deleteMany()
  await prisma.courseworkAssignment.deleteMany()
  await prisma.courseworkRuleTranslation.deleteMany()
  await prisma.courseworkRule.deleteMany()
  await prisma.ebookUploadTranslation.deleteMany()
  await prisma.ebookUpload.deleteMany()
  await prisma.teacherAssignmentAuditLog.deleteMany()
  await prisma.teachingAssignmentApproval.deleteMany()
  await prisma.teacherSubstitution.deleteMany()
  await prisma.teacherWorkloadEntry.deleteMany()
  await prisma.teacherWorkloadPolicy.deleteMany()
  await prisma.teachingAssignmentRole.deleteMany()
  await prisma.teachingAssignment.deleteMany()
  await prisma.teacherDepartmentMembership.deleteMany()
  await prisma.resultReview.deleteMany()
  await prisma.examResult.deleteMany()
  await prisma.studentAnswer.deleteMany()
  await prisma.studentExamAttempt.deleteMany()
  await prisma.examSession.deleteMany()
  await prisma.examQuestion.deleteMany()
  await prisma.questionOptionTranslation.deleteMany()
  await prisma.questionOption.deleteMany()
  await prisma.questionTranslation.deleteMany()
  await prisma.question.deleteMany()
  await prisma.examTranslation.deleteMany()
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
  await prisma.translationEntry.deleteMany()
  await prisma.systemLanguage.deleteMany()
  await prisma.studentProfile.deleteMany()
  await prisma.teacherProfile.deleteMany()
  await prisma.subject.deleteMany()
  await prisma.language.deleteMany()
  await prisma.group.deleteMany()
  await prisma.semester.deleteMany()
  await prisma.academicYear.deleteMany()
  await prisma.department.deleteMany()
  await prisma.user.deleteMany()
  console.log('✓ Cleared existing data')

  // ─── Academic Years ─────────────────────────────────────────
  const years = await Promise.all([
    prisma.academicYear.create({ data: { name: 'Year 1', year: 1 } }),
    prisma.academicYear.create({ data: { name: 'Year 2', year: 2 } }),
    prisma.academicYear.create({ data: { name: 'Year 3', year: 3 } }),
    prisma.academicYear.create({ data: { name: 'Year 4', year: 4 } }),
  ])
  console.log('✓ Created academic years')

  // ─── Languages ──────────────────────────────────────────────
  const semesters = await Promise.all([
    prisma.semester.create({ data: { name: 'Semester 1', number: 1 } }),
    prisma.semester.create({ data: { name: 'Semester 2', number: 2 } }),
  ])
  console.log('✓ Created semesters')

  const langs = await Promise.all([
    prisma.language.create({ data: { name: 'English', code: 'EN' } }),
    prisma.language.create({ data: { name: 'Bengali', code: 'BN' } }),
    prisma.language.create({ data: { name: 'Arabic', code: 'AR' } }),
  ])
  console.log('✓ Created languages')

  // ─── Groups ─────────────────────────────────────────────────
  await Promise.all([
    prisma.systemLanguage.create({ data: { name: 'English', code: 'EN', isDefault: true } }),
    prisma.systemLanguage.create({ data: { name: 'Bangla', code: 'BN', isDefault: false } }),
    prisma.systemLanguage.create({ data: { name: 'Arabic', code: 'AR', isDefault: false } }),
  ])
  console.log('Created system languages')

  const groups = await Promise.all([
    prisma.group.create({ data: { name: 'Group A', code: 'GRP-A' } }),
    prisma.group.create({ data: { name: 'Group B', code: 'GRP-B' } }),
    prisma.group.create({ data: { name: 'Group C', code: 'GRP-C' } }),
  ])
  console.log('✓ Created groups')

  // ─── Departments ─────────────────────────────────────────────
  const deptCSE = await prisma.department.create({
    data: { name: 'Computer Science & Engineering', code: 'CSE' },
  })
  const deptEEE = await prisma.department.create({
    data: { name: 'Electrical & Electronic Engineering', code: 'EEE' },
  })
  const deptBBA = await prisma.department.create({
    data: { name: 'Business Administration', code: 'BBA' },
  })
  console.log('✓ Created departments')

  // ─── Subjects ────────────────────────────────────────────────
  const subjectDS = await prisma.subject.create({
    data: { name: 'Data Structures & Algorithms', code: 'CSE-201', departmentId: deptCSE.id },
  })
  const subjectDB = await prisma.subject.create({
    data: { name: 'Database Management Systems', code: 'CSE-301', departmentId: deptCSE.id },
  })
  const subjectWD = await prisma.subject.create({
    data: { name: 'Web Development', code: 'CSE-401', departmentId: deptCSE.id },
  })
  const subjectCircuits = await prisma.subject.create({
    data: { name: 'Circuit Theory', code: 'EEE-101', departmentId: deptEEE.id },
  })
  const subjectMgmt = await prisma.subject.create({
    data: { name: 'Principles of Management', code: 'BBA-101', departmentId: deptBBA.id },
  })
  void subjectCircuits
  void subjectMgmt
  console.log('✓ Created subjects')

  const [degreeLevelBsc, degreeLevelMsc] = await Promise.all([
    prisma.degreeLevel.create({
      data: { name: 'Bachelor of Science', code: 'BSC', defaultYears: 4, sortOrder: 1 },
    }),
    prisma.degreeLevel.create({
      data: { name: 'Master of Science', code: 'MSC', defaultYears: 2, sortOrder: 2 },
    }),
  ])

  const academicSession = await prisma.academicSession.create({
    data: {
      name: '2026-2027',
      code: '2026-2027',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2027-08-31T23:59:59.999Z'),
      admissionStartDate: new Date('2026-06-01T00:00:00.000Z'),
      admissionEndDate: new Date('2026-08-15T23:59:59.999Z'),
      isCurrent: true,
    },
  })

  const [cseEnglish, cseBangla] = await Promise.all([
    prisma.departmentLanguage.create({
      data: { departmentId: deptCSE.id, languageId: langs[0].id },
    }),
    prisma.departmentLanguage.create({
      data: { departmentId: deptCSE.id, languageId: langs[1].id },
    }),
  ])

  const [programBscCs, programMscAi] = await Promise.all([
    prisma.academicProgram.create({
      data: {
        name: 'BSc in Computer Science',
        code: 'BSC-CS',
        degreeLevelId: degreeLevelBsc.id,
        departmentId: deptCSE.id,
        durationYears: 4,
        totalSemesters: 8,
      },
    }),
    prisma.academicProgram.create({
      data: {
        name: 'MSc in Artificial Intelligence',
        code: 'MSC-AI',
        degreeLevelId: degreeLevelMsc.id,
        departmentId: deptCSE.id,
        durationYears: 2,
        totalSemesters: 4,
      },
    }),
  ])

  const bscProgramYears = await Promise.all(
    [1, 2, 3, 4].map((yearNumber) =>
      prisma.programYear.create({
        data: {
          programId: programBscCs.id,
          yearNumber,
          name: `BSc Year ${yearNumber}`,
          code: `BSC-Y${yearNumber}`,
          sortOrder: yearNumber,
        },
      })
    )
  )
  const mscProgramYears = await Promise.all(
    [1, 2].map((yearNumber) =>
      prisma.programYear.create({
        data: {
          programId: programMscAi.id,
          yearNumber,
          name: `MSc Year ${yearNumber}`,
          code: `MSC-Y${yearNumber}`,
          sortOrder: yearNumber,
        },
      })
    )
  )

  const [bscSemester1, , bscSemester3, , mscSemester1] = await Promise.all([
    prisma.programSemester.create({
      data: { programId: programBscCs.id, programYearId: bscProgramYears[0].id, semesterId: semesters[0].id, semesterNumber: 1 },
    }),
    prisma.programSemester.create({
      data: { programId: programBscCs.id, programYearId: bscProgramYears[0].id, semesterId: semesters[1].id, semesterNumber: 2 },
    }),
    prisma.programSemester.create({
      data: { programId: programBscCs.id, programYearId: bscProgramYears[1].id, semesterId: semesters[0].id, semesterNumber: 3 },
    }),
    prisma.programSemester.create({
      data: { programId: programBscCs.id, programYearId: bscProgramYears[1].id, semesterId: semesters[1].id, semesterNumber: 4 },
    }),
    prisma.programSemester.create({
      data: { programId: programMscAi.id, programYearId: mscProgramYears[0].id, semesterId: semesters[0].id, semesterNumber: 1 },
    }),
  ])

  const [programSubjectProgramming, programSubjectDataStructures, programSubjectMachineLearning] = await Promise.all([
    prisma.programSubject.create({
      data: {
        programId: programBscCs.id,
        programYearId: bscProgramYears[0].id,
        semesterId: semesters[0].id,
        programSemesterId: bscSemester1.id,
        subjectId: subjectWD.id,
        creditHours: 3,
      },
    }),
    prisma.programSubject.create({
      data: {
        programId: programBscCs.id,
        programYearId: bscProgramYears[1].id,
        semesterId: semesters[0].id,
        programSemesterId: bscSemester3.id,
        subjectId: subjectDS.id,
        creditHours: 4,
      },
    }),
    prisma.programSubject.create({
      data: {
        programId: programMscAi.id,
        programYearId: mscProgramYears[0].id,
        semesterId: semesters[0].id,
        programSemesterId: mscSemester1.id,
        subjectId: subjectDB.id,
        creditHours: 4,
      },
    }),
  ])

  const groupsWithContext = await Promise.all([
    prisma.group.update({
      where: { id: groups[0].id },
      data: {
        name: 'BSC-CS-21E',
        code: 'BSC-CS-21E',
        academicYearId: years[1].id,
        departmentId: deptCSE.id,
        programId: programBscCs.id,
        languageId: langs[0].id,
        departmentLanguageId: cseEnglish.id,
        academicSessionId: academicSession.id,
        programYearId: bscProgramYears[1].id,
        currentProgramSemesterId: bscSemester3.id,
      },
    }),
    prisma.group.update({
      where: { id: groups[1].id },
      data: {
        name: 'BSC-CS-11B',
        code: 'BSC-CS-11B',
        academicYearId: years[0].id,
        departmentId: deptCSE.id,
        programId: programBscCs.id,
        languageId: langs[1].id,
        departmentLanguageId: cseBangla.id,
        academicSessionId: academicSession.id,
        programYearId: bscProgramYears[0].id,
        currentProgramSemesterId: bscSemester1.id,
      },
    }),
    prisma.group.update({
      where: { id: groups[2].id },
      data: {
        name: 'MSC-AI-11E',
        code: 'MSC-AI-11E',
        academicYearId: years[0].id,
        departmentId: deptCSE.id,
        programId: programMscAi.id,
        languageId: langs[0].id,
        departmentLanguageId: cseEnglish.id,
        academicSessionId: academicSession.id,
        programYearId: mscProgramYears[0].id,
        currentProgramSemesterId: mscSemester1.id,
      },
    }),
  ])

  const [offeringBscEnglish, offeringBscBangla, offeringMscEnglish] = await Promise.all([
    prisma.academicOffering.create({
      data: {
        academicSessionId: academicSession.id,
        programId: programBscCs.id,
        departmentId: deptCSE.id,
        departmentLanguageId: cseEnglish.id,
        languageId: langs[0].id,
        programYearId: bscProgramYears[1].id,
        semesterId: semesters[0].id,
        programSemesterId: bscSemester3.id,
        groupId: groupsWithContext[0].id,
        subjectId: subjectDS.id,
        programSubjectId: programSubjectDataStructures.id,
        status: 'ACTIVE',
      },
    }),
    prisma.academicOffering.create({
      data: {
        academicSessionId: academicSession.id,
        programId: programBscCs.id,
        departmentId: deptCSE.id,
        departmentLanguageId: cseBangla.id,
        languageId: langs[1].id,
        programYearId: bscProgramYears[0].id,
        semesterId: semesters[0].id,
        programSemesterId: bscSemester1.id,
        groupId: groupsWithContext[1].id,
        subjectId: subjectWD.id,
        programSubjectId: programSubjectProgramming.id,
        status: 'ACTIVE',
      },
    }),
    prisma.academicOffering.create({
      data: {
        academicSessionId: academicSession.id,
        programId: programMscAi.id,
        departmentId: deptCSE.id,
        departmentLanguageId: cseEnglish.id,
        languageId: langs[0].id,
        programYearId: mscProgramYears[0].id,
        semesterId: semesters[0].id,
        programSemesterId: mscSemester1.id,
        groupId: groupsWithContext[2].id,
        subjectId: subjectDB.id,
        programSubjectId: programSubjectMachineLearning.id,
        status: 'ACTIVE',
      },
    }),
  ])

  // ─── Users (hash passwords) ───────────────────────────────────
  const hash = (pwd: string) => bcrypt.hashSync(pwd, 12)

  // Super Admin
  const superAdmin = await prisma.user.create({
    data: {
      email: 'admin@examflow.pro',
      password: hash('Admin@123'),
      name: 'Super Admin',
      role: UserRole.SUPER_ADMIN,
    },
  })
  void superAdmin

  // Department Admin (CSE)
  const deptAdmin = await prisma.user.create({
    data: {
      email: 'cse.admin@examflow.pro',
      password: hash('Admin@123'),
      name: 'CSE Department Admin',
      role: UserRole.DEPARTMENT_ADMIN,
    },
  })
  await prisma.department.update({
    where: { id: deptCSE.id },
    data: { adminId: deptAdmin.id },
  })

  // Teachers
  const teacherUser1 = await prisma.user.create({
    data: {
      email: 'teacher.john@examflow.pro',
      password: hash('Teacher@123'),
      name: 'John Smith',
      role: UserRole.TEACHER,
    },
  })
  const teacherUser2 = await prisma.user.create({
    data: {
      email: 'teacher.sarah@examflow.pro',
      password: hash('Teacher@123'),
      name: 'Sarah Johnson',
      role: UserRole.TEACHER,
    },
  })
  const teacherUser3 = await prisma.user.create({
    data: {
      email: 'teacher.anna@examflow.pro',
      password: hash('Teacher@123'),
      name: 'Anna Petrova',
      role: UserRole.TEACHER,
    },
  })

  const teacher1 = await prisma.teacherProfile.create({
    data: { userId: teacherUser1.id, departmentId: deptCSE.id },
  })
  const teacher2 = await prisma.teacherProfile.create({
    data: { userId: teacherUser2.id, departmentId: deptCSE.id },
  })
  const teacher3 = await prisma.teacherProfile.create({
    data: { userId: teacherUser3.id, departmentId: deptCSE.id },
  })

  // Teacher Assignments
  await prisma.teacherAssignment.create({
    data: {
      teacherId: teacher1.id,
      departmentId: deptCSE.id,
      subjectId: subjectDS.id,
      languageId: langs[0].id,
      groupId: groupsWithContext[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
      academicOfferingId: offeringBscEnglish.id,
    },
  })
  await prisma.teacherAssignment.create({
    data: {
      teacherId: teacher1.id,
      departmentId: deptCSE.id,
      subjectId: subjectDB.id,
      languageId: langs[0].id,
      groupId: groupsWithContext[2].id,
      academicYearId: years[0].id,
      semesterId: semesters[0].id,
      academicOfferingId: offeringMscEnglish.id,
    },
  })
  await prisma.teacherAssignment.create({
    data: {
      teacherId: teacher2.id,
      departmentId: deptCSE.id,
      subjectId: subjectWD.id,
      languageId: langs[1].id,
      groupId: groupsWithContext[1].id,
      academicYearId: years[0].id,
      semesterId: semesters[0].id,
      academicOfferingId: offeringBscBangla.id,
    },
  })
  await prisma.teacherDepartmentMembership.createMany({
    data: [
      { teacherId: teacher1.id, departmentId: deptCSE.id, isPrimary: true, isActive: true },
      { teacherId: teacher2.id, departmentId: deptCSE.id, isPrimary: true, isActive: true },
      { teacherId: teacher3.id, departmentId: deptCSE.id, isPrimary: true, isActive: true },
    ],
  })

  const teacher1Membership = await prisma.teacherDepartmentMembership.findUniqueOrThrow({
    where: { teacherId_departmentId: { teacherId: teacher1.id, departmentId: deptCSE.id } },
  })
  const teacher2Membership = await prisma.teacherDepartmentMembership.findUniqueOrThrow({
    where: { teacherId_departmentId: { teacherId: teacher2.id, departmentId: deptCSE.id } },
  })

  const normalizedAssignment1 = await prisma.teachingAssignment.create({
    data: {
      teacherId: teacher1.id,
      membershipId: teacher1Membership.id,
      departmentId: deptCSE.id,
      academicOfferingId: offeringBscEnglish.id,
      status: TeachingAssignmentStatus.ACTIVE,
      weeklyHours: 8,
      lectureHours: 3,
      labHours: 2,
      consultationHours: 1,
      assessmentHours: 2,
      isPrimary: true,
      roles: {
        create: [
          { role: TeachingAssignmentRoleType.LEAD_TEACHER, isPrimary: true },
          { role: TeachingAssignmentRoleType.EXAMINER, isPrimary: false },
        ],
      },
      approvals: {
        create: {
          action: TeachingAssignmentStatus.ACTIVE,
          statusTo: TeachingAssignmentStatus.ACTIVE,
          notes: 'Seeded Phase 4 lead teacher assignment',
        },
      },
    },
  })

  await prisma.teachingAssignment.create({
    data: {
      teacherId: teacher2.id,
      membershipId: teacher2Membership.id,
      departmentId: deptCSE.id,
      academicOfferingId: offeringBscBangla.id,
      status: TeachingAssignmentStatus.ACTIVE,
      weeklyHours: 6,
      lectureHours: 2,
      labHours: 2,
      consultationHours: 1,
      assessmentHours: 1,
      isPrimary: true,
      roles: {
        create: [
          { role: TeachingAssignmentRoleType.ASSISTANT_TEACHER, isPrimary: true },
          { role: TeachingAssignmentRoleType.REVIEWER, isPrimary: false },
        ],
      },
      approvals: {
        create: {
          action: TeachingAssignmentStatus.ACTIVE,
          statusTo: TeachingAssignmentStatus.ACTIVE,
          notes: 'Seeded Phase 4 assistant teacher assignment',
        },
      },
    },
  })

  await prisma.teacherWorkloadPolicy.create({
    data: {
      departmentId: deptCSE.id,
      programId: programBscCs.id,
      academicSessionId: academicSession.id,
      maxWeeklyHours: 18,
      maxSemesterHours: 220,
      defaultLectureWeight: 1,
      defaultLabWeight: 1.25,
      defaultAssessmentWeight: 1,
    },
  })

  await prisma.teacherWorkloadEntry.create({
    data: {
      teacherId: teacher1.id,
      teachingAssignmentId: normalizedAssignment1.id,
      category: 'ADMINISTRATION',
      hours: 2,
      isApproved: true,
      notes: 'Seeded departmental coordination hours',
    },
  })

  await prisma.teacherSubstitution.create({
    data: {
      originalTeacherId: teacher1.id,
      substituteTeacherId: teacher3.id,
      teachingAssignmentId: normalizedAssignment1.id,
      startsAt: new Date('2026-08-01T00:00:00.000Z'),
      endsAt: new Date('2026-08-14T23:59:59.000Z'),
      reason: 'Conference travel coverage',
      status: TeacherSubstitutionStatus.APPROVED,
      approvedAt: new Date(),
    },
  })
  console.log('✓ Created teachers and assignments')

  // Students
  const studentUsers = await Promise.all(
    [
      { email: 'alice@student.examflow.pro', name: 'Alice Brown' },
      { email: 'bob@student.examflow.pro', name: 'Bob Davis' },
      { email: 'charlie@student.examflow.pro', name: 'Charlie Wilson' },
    ].map((u) =>
      prisma.user.create({
        data: {
          email: u.email,
          password: hash('Student@123'),
          name: u.name,
          role: UserRole.STUDENT,
        },
      })
    )
  )

  const studentProfiles = await Promise.all(
    studentUsers.map((u) =>
      prisma.studentProfile.create({
        data: {
          userId: u.id,
          departmentId: deptCSE.id,
        },
      })
    )
  )

  // Student Subject Enrollments
  for (const sp of studentProfiles) {
    await prisma.studentSubject.create({
      data: {
        studentId: sp.id,
        subjectId: subjectDS.id,
        languageId: langs[0].id,
        groupId: groupsWithContext[0].id,
        academicYearId: years[1].id,
        semesterId: semesters[0].id,
        academicOfferingId: offeringBscEnglish.id,
      },
    })
    await prisma.studentSubject.create({
      data: {
        studentId: sp.id,
        subjectId: subjectWD.id,
        languageId: langs[1].id,
        groupId: groupsWithContext[1].id,
        academicYearId: years[0].id,
        semesterId: semesters[0].id,
        academicOfferingId: offeringBscBangla.id,
      },
    })
  }
  console.log('✓ Created students and enrollments')

  // ─── Question Bank ─────────────────────────────────────────────
  // MCQ Questions for Data Structures
  const q1 = await prisma.question.create({
    data: {
      subjectId: subjectDS.id,
      languageId: langs[0].id,
      groupId: groupsWithContext[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
      academicOfferingId: offeringBscEnglish.id,
      teacherId: teacher1.id,
      type: QuestionType.MCQ,
      text: 'What is the time complexity of binary search?',
      marks: 2,
      difficulty: 'easy',
      options: {
        create: [
          { text: 'O(n)', isCorrect: false, orderIndex: 0 },
          { text: 'O(log n)', isCorrect: true, orderIndex: 1 },
          { text: 'O(n²)', isCorrect: false, orderIndex: 2 },
          { text: 'O(1)', isCorrect: false, orderIndex: 3 },
        ],
      },
    },
    include: {
      options: {
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  const q2 = await prisma.question.create({
    data: {
      subjectId: subjectDS.id,
      languageId: langs[0].id,
      groupId: groupsWithContext[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
      academicOfferingId: offeringBscEnglish.id,
      teacherId: teacher1.id,
      type: QuestionType.MCQ,
      text: 'Which data structure uses LIFO (Last In First Out) principle?',
      marks: 2,
      difficulty: 'easy',
      options: {
        create: [
          { text: 'Queue', isCorrect: false, orderIndex: 0 },
          { text: 'Stack', isCorrect: true, orderIndex: 1 },
          { text: 'Linked List', isCorrect: false, orderIndex: 2 },
          { text: 'Tree', isCorrect: false, orderIndex: 3 },
        ],
      },
    },
    include: {
      options: {
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  const q3 = await prisma.question.create({
    data: {
      subjectId: subjectDS.id,
      languageId: langs[0].id,
      groupId: groupsWithContext[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
      academicOfferingId: offeringBscEnglish.id,
      teacherId: teacher1.id,
      type: QuestionType.TRUE_FALSE,
      text: 'A binary tree can have at most 2 children per node.',
      marks: 1,
      difficulty: 'easy',
      options: {
        create: [
          { text: 'True', isCorrect: true, orderIndex: 0 },
          { text: 'False', isCorrect: false, orderIndex: 1 },
        ],
      },
    },
    include: {
      options: {
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  const q4 = await prisma.question.create({
    data: {
      subjectId: subjectDS.id,
      languageId: langs[0].id,
      groupId: groupsWithContext[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
      academicOfferingId: offeringBscEnglish.id,
      teacherId: teacher1.id,
      type: QuestionType.SHORT_ANSWER,
      text: 'What does FIFO stand for?',
      marks: 2,
      difficulty: 'easy',
      expectedAnswer: 'First In First Out',
      keywords: JSON.stringify(['first', 'in', 'first', 'out', 'FIFO']),
    },
  })

  const q5 = await prisma.question.create({
    data: {
      subjectId: subjectDS.id,
      languageId: langs[0].id,
      groupId: groupsWithContext[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
      academicOfferingId: offeringBscEnglish.id,
      teacherId: teacher1.id,
      type: QuestionType.WRITTEN_ANSWER,
      text: 'Explain the difference between BFS and DFS traversal algorithms. Include examples and use cases for each.',
      marks: 5,
      difficulty: 'medium',
    },
  })
  console.log('✓ Created question bank')

  // ─── Sample Exam ──────────────────────────────────────────────
  await prisma.questionTranslation.createMany({
    data: [
      { questionId: q1.id, languageId: langs[0].id, text: q1.text },
      { questionId: q2.id, languageId: langs[0].id, text: q2.text },
      { questionId: q3.id, languageId: langs[0].id, text: q3.text },
      {
        questionId: q4.id,
        languageId: langs[0].id,
        text: q4.text,
        expectedAnswer: q4.expectedAnswer,
        keywords: q4.keywords,
      },
      { questionId: q5.id, languageId: langs[0].id, text: q5.text },
    ],
  })

  await prisma.questionOptionTranslation.createMany({
    data: [
      ...q1.options.map((option) => ({
        questionOptionId: option.id,
        languageId: langs[0].id,
        text: option.text,
      })),
      ...q2.options.map((option) => ({
        questionOptionId: option.id,
        languageId: langs[0].id,
        text: option.text,
      })),
      ...q3.options.map((option) => ({
        questionOptionId: option.id,
        languageId: langs[0].id,
        text: option.text,
      })),
    ],
  })
  console.log('Created question bank translations')

  const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
  const futureEnd = new Date(Date.now() + 3 * 60 * 60 * 1000)   // 3 hours from now

  const seededExam = await prisma.exam.create({
    data: {
      title: 'Data Structures Mid-term Exam',
      description: 'This exam covers arrays, linked lists, stacks, queues, and basic tree concepts.',
      teacherId: teacher1.id,
      departmentId: deptCSE.id,
      subjectId: subjectDS.id,
      languageId: langs[0].id,
      groupId: groupsWithContext[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
      academicOfferingId: offeringBscEnglish.id,
      questionType: QuestionType.MIXED,
      status: ExamStatus.SCHEDULED,
      resultMode: ResultMode.TEACHER_REVIEW,
      totalMarks: 12,
      passingMarks: 6,
      duration: 60,
      startTime: futureStart,
      endTime: futureEnd,
      autoPublish: false,
      showAnswers: true,
      showMarks: true,
      instructions: 'Read each question carefully. For written answers, be concise and precise. No external resources allowed.',
      questions: {
        create: [
          { questionId: q1.id, orderIndex: 1, marks: 2 },
          { questionId: q2.id, orderIndex: 2, marks: 2 },
          { questionId: q3.id, orderIndex: 3, marks: 1 },
          { questionId: q4.id, orderIndex: 4, marks: 2 },
          { questionId: q5.id, orderIndex: 5, marks: 5 },
        ],
      },
    },
  })
  console.log('✓ Created sample exam')

  // ─── Welcome Notifications ────────────────────────────────────
  await prisma.examTranslation.create({
    data: {
      examId: seededExam.id,
      languageId: langs[0].id,
      title: seededExam.title,
      description: seededExam.description,
      instructions: seededExam.instructions,
    },
  })

  await prisma.notification.createMany({
    data: [
      {
        userId: teacherUser1.id,
        title: 'Welcome to ExamFlow Pro',
        message: 'Your teacher account is ready. Start by creating questions in your question bank.',
        type: 'info',
        link: '/teacher/questions',
      },
      ...studentUsers.map((u) => ({
        userId: u.id,
        title: 'Welcome to ExamFlow Pro',
        message: 'Your student account is ready. Check your enrolled exams.',
        type: 'info' as const,
        link: '/student/exams',
      })),
    ],
  })
  console.log('✓ Created notifications')

  console.log('\n✅ Seed completed successfully!\n')
  console.log('═══════════════════════════════════════')
  console.log('DEMO CREDENTIALS')
  console.log('═══════════════════════════════════════')
  console.log('Super Admin:      admin@examflow.pro     / Admin@123')
  console.log('Dept Admin (CSE): cse.admin@examflow.pro / Admin@123')
  console.log('Teacher 1:        teacher.john@examflow.pro / Teacher@123')
  console.log('Teacher 2:        teacher.sarah@examflow.pro / Teacher@123')
  console.log('Student 1:        alice@student.examflow.pro / Student@123')
  console.log('Student 2:        bob@student.examflow.pro   / Student@123')
  console.log('Student 3:        charlie@student.examflow.pro / Student@123')
  console.log('═══════════════════════════════════════\n')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
