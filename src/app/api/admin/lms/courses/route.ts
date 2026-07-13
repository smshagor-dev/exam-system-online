import { NextRequest, NextResponse } from 'next/server'
import { createPhase10Course } from '@/lib/phase10-lms'
import { prisma } from '@/lib/prisma'
import { requirePhase10Permission } from '@/lib/phase10-route-auth'
import { phase10CourseCreateSchema } from '@/lib/phase10-validators'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const departmentId = searchParams.get('departmentId')?.trim() ?? undefined
  const access = await requirePhase10Permission('lms.progress.read', { departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const where = departmentId ? { departmentId } : undefined
  const courses = await prisma.phase10Course.findMany({
    where,
    include: {
      subject: true,
      semester: true,
      academicOffering: true,
      lessons: true,
      translations: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json(courses)
}

export async function POST(req: NextRequest) {
  const parsed = phase10CourseCreateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const access = await requirePhase10Permission('lms.course.manage', {
    departmentId: parsed.data.departmentId,
    academicOfferingId: parsed.data.academicOfferingId ?? null,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const course = await createPhase10Course(parsed.data)
  return NextResponse.json(course, { status: 201 })
}
