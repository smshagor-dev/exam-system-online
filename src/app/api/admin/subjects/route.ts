// src/app/api/admin/subjects/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { canManageDepartment } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { subjectSchema } from '@/lib/validators'
import { UserRole } from '@prisma/client'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user) return null
  if (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.DEPARTMENT_ADMIN) return null
  return session
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const subjects = await prisma.subject.findMany({
    where: session.user.role === UserRole.SUPER_ADMIN ? undefined : {
      department: { adminId: session.user.id },
    },
    include: { department: true, language: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(subjects)
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const parsed = subjectSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const allowed = await canManageDepartment({ userId: session.user.id, role: session.user.role }, parsed.data.departmentId)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const subject = await prisma.subject.create({ data: parsed.data })
    return NextResponse.json(subject, { status: 201 })
  } catch (err: any) {
    if (err.code === 'P2002') return NextResponse.json({ error: 'Code already exists' }, { status: 409 })
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
