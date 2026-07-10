/**
 * ExamFlow Pro - Database Seed
 * Run: npx ts-node --project tsconfig.seed.json prisma/seed.ts
 */

import { PrismaClient, UserRole, QuestionType, ExamStatus, ResultMode } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding ExamFlow Pro database...')

  // ─── Clean slate ────────────────────────────────────────────
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
  await prisma.teacherAssignment.deleteMany()
  await prisma.studentSubject.deleteMany()
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
  console.log('✓ Created subjects')

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

  const teacher1 = await prisma.teacherProfile.create({
    data: { userId: teacherUser1.id, departmentId: deptCSE.id },
  })
  const teacher2 = await prisma.teacherProfile.create({
    data: { userId: teacherUser2.id, departmentId: deptCSE.id },
  })

  // Teacher Assignments
  await prisma.teacherAssignment.create({
    data: {
      teacherId: teacher1.id,
      departmentId: deptCSE.id,
      subjectId: subjectDS.id,
      languageId: langs[0].id,
      groupId: groups[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
    },
  })
  await prisma.teacherAssignment.create({
    data: {
      teacherId: teacher1.id,
      departmentId: deptCSE.id,
      subjectId: subjectDB.id,
      languageId: langs[0].id,
      groupId: groups[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
    },
  })
  await prisma.teacherAssignment.create({
    data: {
      teacherId: teacher2.id,
      departmentId: deptCSE.id,
      subjectId: subjectWD.id,
      languageId: langs[0].id,
      groupId: groups[1].id,
      academicYearId: years[2].id,
      semesterId: semesters[0].id,
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
        groupId: groups[0].id,
        academicYearId: years[1].id,
        semesterId: semesters[0].id,
      },
    })
    await prisma.studentSubject.create({
      data: {
        studentId: sp.id,
        subjectId: subjectDB.id,
        languageId: langs[0].id,
        groupId: groups[0].id,
        academicYearId: years[1].id,
        semesterId: semesters[0].id,
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
      groupId: groups[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
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
  })

  const q2 = await prisma.question.create({
    data: {
      subjectId: subjectDS.id,
      languageId: langs[0].id,
      groupId: groups[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
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
  })

  const q3 = await prisma.question.create({
    data: {
      subjectId: subjectDS.id,
      languageId: langs[0].id,
      groupId: groups[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
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
  })

  const q4 = await prisma.question.create({
    data: {
      subjectId: subjectDS.id,
      languageId: langs[0].id,
      groupId: groups[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
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
      groupId: groups[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
      teacherId: teacher1.id,
      type: QuestionType.WRITTEN_ANSWER,
      text: 'Explain the difference between BFS and DFS traversal algorithms. Include examples and use cases for each.',
      marks: 5,
      difficulty: 'medium',
    },
  })
  console.log('✓ Created question bank')

  // ─── Sample Exam ──────────────────────────────────────────────
  const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
  const futureEnd = new Date(Date.now() + 3 * 60 * 60 * 1000)   // 3 hours from now

  const exam = await prisma.exam.create({
    data: {
      title: 'Data Structures Mid-term Exam',
      description: 'This exam covers arrays, linked lists, stacks, queues, and basic tree concepts.',
      teacherId: teacher1.id,
      departmentId: deptCSE.id,
      subjectId: subjectDS.id,
      languageId: langs[0].id,
      groupId: groups[0].id,
      academicYearId: years[1].id,
      semesterId: semesters[0].id,
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
