import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import { getStudentPhase10CourseDetail } from '@/lib/phase10-lms'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await requireRole(UserRole.STUDENT)
  const { id } = await params
  const course = await getStudentPhase10CourseDetail(id, session.user.id)
  return NextResponse.json(course)
}
