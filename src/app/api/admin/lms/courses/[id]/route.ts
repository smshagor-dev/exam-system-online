import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase10Permission } from '@/lib/phase10-route-auth'
import { phase10CourseUpdateSchema } from '@/lib/phase10-validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const course = await prisma.phase10Course.findUnique({
    where: { id },
    include: {
      versions: {
        include: {
          sections: {
            include: {
              lessons: {
                include: {
                  materials: true,
                  videoAssets: true,
                  liveClasses: true,
                  translations: true,
                },
              },
            },
          },
        },
      },
      outcomes: true,
      prerequisites: {
        include: {
          prerequisiteSubject: true,
        },
      },
      translations: true,
    },
  })
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

  const access = await requirePhase10Permission('lms.progress.read', {
    departmentId: course.departmentId,
    academicOfferingId: course.academicOfferingId,
    subjectId: course.subjectId,
    languageId: course.languageId,
    groupId: course.groupId,
    semesterId: course.semesterId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json(course)
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const course = await prisma.phase10Course.findUnique({ where: { id } })
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

  const access = await requirePhase10Permission('lms.course.manage', {
    departmentId: course.departmentId,
    academicOfferingId: course.academicOfferingId,
    subjectId: course.subjectId,
    languageId: course.languageId,
    groupId: course.groupId,
    semesterId: course.semesterId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = phase10CourseUpdateSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const updated = await prisma.phase10Course.update({
    where: { id },
    data: {
      title: parsed.data.title,
      summary: parsed.data.summary,
      status: parsed.data.status,
      isPublished: parsed.data.status === 'PUBLISHED' ? true : undefined,
      publishedAt: parsed.data.status === 'PUBLISHED' ? new Date() : undefined,
    },
  })

  return NextResponse.json(updated)
}
