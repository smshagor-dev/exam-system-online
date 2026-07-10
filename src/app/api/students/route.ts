import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import { getStudentDirectory } from '@/services/student-progress.service'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (
    session.user.role !== UserRole.SUPER_ADMIN &&
    session.user.role !== UserRole.DEPARTMENT_ADMIN &&
    session.user.role !== UserRole.TEACHER
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const academicYearId = searchParams.get('academicYearId') || undefined
  const groupId = searchParams.get('groupId') || undefined
  const languageId = searchParams.get('languageId') || undefined

  const students = await getStudentDirectory(
    { userId: session.user.id, role: session.user.role },
    { academicYearId, groupId, languageId }
  )

  return NextResponse.json(students)
}
