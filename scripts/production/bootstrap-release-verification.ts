import bcrypt from 'bcryptjs'
import { PrismaClient, UserRole } from '@prisma/client/index'

const prisma = new PrismaClient()

export const RELEASE_VERIFY_ADMIN_EMAIL = 'release.verify.admin@examflow.pro'
export const RELEASE_VERIFY_TEACHER_EMAIL = 'release.verify.teacher@examflow.pro'
export const RELEASE_VERIFY_STUDENT_EMAIL = 'release.verify.student@examflow.pro'
export const RELEASE_VERIFY_DEPARTMENT_CODE = 'RELV-DEPT'

function hashPassword(value: string) {
  return bcrypt.hashSync(value, 12)
}

function parseArg(name: string) {
  const prefix = `${name}=`
  const exact = process.argv.find((arg) => arg.startsWith(prefix))
  return exact ? exact.slice(prefix.length) : null
}

function assertBootstrapAllowed() {
  if (process.env.ALLOW_PRODUCTION_VERIFICATION_BOOTSTRAP !== 'true') {
    throw new Error('Release verification bootstrap requires ALLOW_PRODUCTION_VERIFICATION_BOOTSTRAP=true.')
  }
}

async function ensureDepartment() {
  return prisma.department.upsert({
    where: { code: RELEASE_VERIFY_DEPARTMENT_CODE },
    update: {
      name: 'Release Verification Department',
      description: 'Temporary release-verification department',
      isActive: true,
      adminId: null,
    },
    create: {
      name: 'Release Verification Department',
      code: RELEASE_VERIFY_DEPARTMENT_CODE,
      description: 'Temporary release-verification department',
      isActive: true,
    },
  })
}

async function ensureUser(input: {
  email: string
  password: string
  name: string
  role: UserRole
}) {
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      role: input.role,
      password: hashPassword(input.password),
      isActive: true,
      isEmailVerified: true,
    },
    create: {
      email: input.email,
      name: input.name,
      role: input.role,
      password: hashPassword(input.password),
      isActive: true,
      isEmailVerified: true,
    },
  })
}

export async function bootstrapReleaseVerificationBundle() {
  assertBootstrapAllowed()

  const adminPassword = process.env.RELEASE_VERIFY_ADMIN_PASSWORD
  const teacherPassword = process.env.RELEASE_VERIFY_TEACHER_PASSWORD
  const studentPassword = process.env.RELEASE_VERIFY_STUDENT_PASSWORD

  if (!adminPassword || !teacherPassword || !studentPassword) {
    throw new Error(
      'Set RELEASE_VERIFY_ADMIN_PASSWORD, RELEASE_VERIFY_TEACHER_PASSWORD, and RELEASE_VERIFY_STUDENT_PASSWORD.'
    )
  }

  const department = await ensureDepartment()

  const [admin, teacherUser, studentUser] = await Promise.all([
    ensureUser({
      email: RELEASE_VERIFY_ADMIN_EMAIL,
      password: adminPassword,
      name: 'Release Verification Admin',
      role: UserRole.SUPER_ADMIN,
    }),
    ensureUser({
      email: RELEASE_VERIFY_TEACHER_EMAIL,
      password: teacherPassword,
      name: 'Release Verification Teacher',
      role: UserRole.TEACHER,
    }),
    ensureUser({
      email: RELEASE_VERIFY_STUDENT_EMAIL,
      password: studentPassword,
      name: 'Release Verification Student',
      role: UserRole.STUDENT,
    }),
  ])

  await Promise.all([
    prisma.teacherProfile.upsert({
      where: { userId: teacherUser.id },
      update: { departmentId: department.id },
      create: { userId: teacherUser.id, departmentId: department.id },
    }),
    prisma.studentProfile.upsert({
      where: { userId: studentUser.id },
      update: { departmentId: department.id },
      create: { userId: studentUser.id, departmentId: department.id },
    }),
  ])

  return {
    departmentId: department.id,
    users: {
      admin: { email: admin.email, role: admin.role },
      teacher: { email: teacherUser.email, role: teacherUser.role },
      student: { email: studentUser.email, role: studentUser.role },
    },
  }
}

export async function bootstrapSingleAdmin(email: string, password: string) {
  assertBootstrapAllowed()

  const admin = await ensureUser({
    email,
    password,
    name: 'Release Verification Admin',
    role: UserRole.SUPER_ADMIN,
  })

  return {
    email: admin.email,
    role: admin.role,
  }
}

export async function cleanupReleaseVerificationBundle() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        in: [
          RELEASE_VERIFY_ADMIN_EMAIL,
          RELEASE_VERIFY_TEACHER_EMAIL,
          RELEASE_VERIFY_STUDENT_EMAIL,
        ],
      },
    },
    select: { id: true, email: true },
  })

  const userIds = users.map((user) => user.id)

  if (userIds.length > 0) {
    await prisma.studentProfile.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.teacherProfile.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.activityLog.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  }

  const department = await prisma.department.findUnique({
    where: { code: RELEASE_VERIFY_DEPARTMENT_CODE },
    select: { id: true },
  })

  if (department) {
    await prisma.department.delete({ where: { id: department.id } }).catch(() => {})
  }

  return {
    removedUsers: users.map((user) => user.email),
    removedDepartmentCode: department ? RELEASE_VERIFY_DEPARTMENT_CODE : null,
  }
}

async function main() {
  const mode = parseArg('--mode') ?? 'bootstrap-admin'

  if (mode === 'bootstrap-admin') {
    const email = parseArg('--email')
    const password = process.env.RELEASE_BOOTSTRAP_PASSWORD
    if (!email || !password) {
      throw new Error('Provide --email=<address> and RELEASE_BOOTSTRAP_PASSWORD.')
    }
    const result = await bootstrapSingleAdmin(email, password)
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (mode === 'bootstrap-bundle') {
    const result = await bootstrapReleaseVerificationBundle()
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (mode === 'cleanup-bundle') {
    const result = await cleanupReleaseVerificationBundle()
    console.log(JSON.stringify(result, null, 2))
    return
  }

  throw new Error(`Unsupported mode: ${mode}`)
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
