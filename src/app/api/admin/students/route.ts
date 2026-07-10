import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdminScope } from '@/lib/admin-scope'
import { canManageDepartment } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) return null
  if (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.DEPARTMENT_ADMIN) return null
  return session
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const scope = await getAdminScope()

  const { searchParams } = new URL(req.url)
  const departmentId = searchParams.get('departmentId')
  const where: any = { role: UserRole.STUDENT }

  if (scope.isSuperAdmin && departmentId) {
    where.studentProfile = { departmentId }
  } else if (!scope.isSuperAdmin) {
    where.studentProfile = { departmentId: { in: scope.managedDepartmentIds } }
  }

  const students = await prisma.user.findMany({
    where,
    include: {
      studentProfile: {
        include: {
          department: true,
          subjects: {
            include: { subject: true, group: true, academicYear: true, semester: true },
          },
          _count: { select: { examAttempts: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(students)
}

// Admin can manually create students
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, email, password, departmentId, subjectId, languageId, groupId, academicYearId, semesterId } = body

  if (!name || !email || !password || !departmentId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const allowed = await canManageDepartment(
    { userId: session.user.id, role: session.user.role },
    departmentId
  )
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden for this department' }, { status: 403 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 })

  if (subjectId) {
    const [year, group] = await Promise.all([
      prisma.academicYear.findFirst({ where: { id: academicYearId, isActive: true }, select: { id: true } }),
      prisma.group.findFirst({ where: { id: groupId, academicYearId, isActive: true }, select: { id: true } }),
    ])

    if (!year) return NextResponse.json({ error: 'Invalid academic year' }, { status: 400 })
    if (!group) return NextResponse.json({ error: 'Group does not belong to this academic year' }, { status: 400 })
  }

  const hashedPwd = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPwd,
      name,
      role: UserRole.STUDENT,
      studentProfile: {
        create: {
          departmentId,
          customFieldResponses: body.customFieldResponses ?? {},
          subjects: subjectId ? {
            create: { subjectId, languageId, groupId, academicYearId, semesterId },
          } : undefined,
        },
      },
    },
    select: { id: true, email: true, name: true, role: true },
  })

  return NextResponse.json(user, { status: 201 })
}
