import bcrypt from 'bcryptjs'
import { PrismaClient, UserRole } from '@prisma/client/index'

const prisma = new PrismaClient()

const SYSTEM_LANGUAGES = [
  { code: 'EN', name: 'English', isDefault: true },
  { code: 'BN', name: 'Bangla', isDefault: false },
  { code: 'AR', name: 'Arabic', isDefault: false },
]

const DEMO_USERS = [
  { email: 'admin@examflow.pro', password: 'Admin@123', name: 'Super Admin', role: UserRole.SUPER_ADMIN },
  { email: 'cse.admin@examflow.pro', password: 'Admin@123', name: 'CSE Department Admin', role: UserRole.DEPARTMENT_ADMIN },
  { email: 'teacher.john@examflow.pro', password: 'Teacher@123', name: 'John Smith', role: UserRole.TEACHER },
  { email: 'teacher.sarah@examflow.pro', password: 'Teacher@123', name: 'Sarah Johnson', role: UserRole.TEACHER },
  { email: 'teacher.anna@examflow.pro', password: 'Teacher@123', name: 'Anna Petrova', role: UserRole.TEACHER },
  { email: 'alice@student.examflow.pro', password: 'Student@123', name: 'Alice Brown', role: UserRole.STUDENT },
  { email: 'bob@student.examflow.pro', password: 'Student@123', name: 'Bob Davis', role: UserRole.STUDENT },
  { email: 'charlie@student.examflow.pro', password: 'Student@123', name: 'Charlie Wilson', role: UserRole.STUDENT },
] as const

async function upsertDemoUser(account: (typeof DEMO_USERS)[number]) {
  const password = await bcrypt.hash(account.password, 12)

  return prisma.user.upsert({
    where: { email: account.email },
    update: {
      password,
      name: account.name,
      role: account.role,
      isActive: true,
      isEmailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiresAt: null,
    },
    create: {
      email: account.email,
      password,
      name: account.name,
      role: account.role,
      isActive: true,
      isEmailVerified: true,
    },
  })
}

async function runProductionSeed() {
  if (process.env.ALLOW_TEST_FIXTURES === 'true') {
    throw new Error('Production seed refuses to run while test fixture flags are enabled.')
  }

  for (const language of SYSTEM_LANGUAGES) {
    await prisma.systemLanguage.upsert({
      where: { code: language.code },
      update: {
        name: language.name,
        isActive: true,
        isDefault: language.isDefault,
      },
      create: {
        code: language.code,
        name: language.name,
        isActive: true,
        isDefault: language.isDefault,
      },
    })
  }

  await prisma.systemSetting.upsert({
    where: { key: 'global' },
    update: {
      requireEmailVerification: true,
    },
    create: {
      key: 'global',
      systemName: 'ExamFlow Pro',
      systemShortName: 'EMS',
      systemDescription: 'Professional Online Exam Management System',
      aiEnabled: false,
      aiTemperature: 0.2,
      aiOpenAiModel: 'gpt-4o-mini',
      aiGeminiModel: 'gemini-2.5-flash',
      aiClaudeModel: 'claude-sonnet-4-20250514',
      requireEmailVerification: true,
    },
  })

  const cseDepartment = await prisma.department.upsert({
    where: { code: 'CSE' },
    update: {
      name: 'Computer Science & Engineering',
      isActive: true,
    },
    create: {
      name: 'Computer Science & Engineering',
      code: 'CSE',
      description: 'Demo department for production-ready role previews',
      isActive: true,
    },
  })

  const demoUsers = new Map<string, Awaited<ReturnType<typeof upsertDemoUser>>>()
  for (const account of DEMO_USERS) {
    demoUsers.set(account.email, await upsertDemoUser(account))
  }

  const departmentAdmin = demoUsers.get('cse.admin@examflow.pro')
  if (departmentAdmin) {
    await prisma.department.update({
      where: { id: cseDepartment.id },
      data: { adminId: departmentAdmin.id },
    })
  }

  for (const email of ['teacher.john@examflow.pro', 'teacher.sarah@examflow.pro', 'teacher.anna@examflow.pro']) {
    const user = demoUsers.get(email)
    if (!user) continue
    await prisma.teacherProfile.upsert({
      where: { userId: user.id },
      update: { departmentId: cseDepartment.id },
      create: { userId: user.id, departmentId: cseDepartment.id },
    })
  }

  for (const email of ['alice@student.examflow.pro', 'bob@student.examflow.pro', 'charlie@student.examflow.pro']) {
    const user = demoUsers.get(email)
    if (!user) continue
    await prisma.studentProfile.upsert({
      where: { userId: user.id },
      update: { departmentId: cseDepartment.id },
      create: {
        userId: user.id,
        departmentId: cseDepartment.id,
        customFieldResponses: { course: 'BACHELOR_OF_SCIENCE' },
      },
    })
  }

  console.log('Production seed completed successfully.')
  console.log(`System languages ensured: ${SYSTEM_LANGUAGES.length}`)
  console.log(`Demo users ensured: ${DEMO_USERS.length}`)
  console.log('Demo credentials: admin@examflow.pro / Admin@123, teacher.john@examflow.pro / Teacher@123, alice@student.examflow.pro / Student@123')
}

runProductionSeed()
  .catch((error) => {
    console.error('Production seed failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
