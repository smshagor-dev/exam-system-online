import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import { getStudentProgressDetail } from '@/services/student-progress.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (
    session.user.role !== UserRole.SUPER_ADMIN &&
    session.user.role !== UserRole.DEPARTMENT_ADMIN &&
    session.user.role !== UserRole.TEACHER
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const detail = await getStudentProgressDetail({ userId: session.user.id, role: session.user.role }, id)

  if (!detail) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  return NextResponse.json(detail)
}
