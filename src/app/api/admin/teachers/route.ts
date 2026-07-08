import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdminScope } from '@/lib/admin-scope'
import { prisma } from '@/lib/prisma'
import { registerTeacherSchema } from '@/lib/validators'
import { UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

export async function GET() {
  const session = await auth()
  if (!session?.user || (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.DEPARTMENT_ADMIN)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const scope = await getAdminScope()

  const teachers = await prisma.user.findMany({
    where: {
      role: UserRole.TEACHER,
      ...(scope.isSuperAdmin ? {} : {
        teacherProfile: { departmentId: { in: scope.managedDepartmentIds } },
      }),
    },
    include: {
      teacherProfile: {
        include: {
          department: true,
          assignments: {
            include: {
              subject: true, language: true, group: true, academicYear: true, semester: true,
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(teachers)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== UserRole.SUPER_ADMIN) {
    return NextResponse.json({ error: 'Only Super Admin can create teachers' }, { status: 403 })
  }

  const body = await req.json()
  const { name, email, password, departmentId, phone } = body

  if (!name || !email || !password || !departmentId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

  const hashedPwd = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPwd,
      name,
      role: UserRole.TEACHER,
      teacherProfile: {
        create: { departmentId, phone: phone || null },
      },
    },
    select: { id: true, email: true, name: true, role: true },
  })

  return NextResponse.json(user, { status: 201 })
}
