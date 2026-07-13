import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import { listStudentPhase10Courses } from '@/lib/phase10-lms'

export async function GET() {
  const session = await requireRole(UserRole.STUDENT)
  const payload = await listStudentPhase10Courses(session.user.id)
  return NextResponse.json(payload)
}
