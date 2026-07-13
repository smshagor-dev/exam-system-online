import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase10Permission } from '@/lib/phase10-route-auth'
import { createPhase10VideoAsset } from '@/lib/phase10-lms'
import { phase10VideoCreateSchema } from '@/lib/phase10-validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params
  const lesson = await prisma.phase10Lesson.findUnique({
    where: { id },
    include: {
      course: true,
    },
  })
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

  const access = await requirePhase10Permission('lms.material.manage', {
    departmentId: lesson.course.departmentId,
    academicOfferingId: lesson.course.academicOfferingId,
    subjectId: lesson.course.subjectId,
    languageId: lesson.course.languageId,
    groupId: lesson.course.groupId,
    semesterId: lesson.course.semesterId,
  })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await req.formData()
  const payload = phase10VideoCreateSchema.safeParse({
    title: String(formData.get('title') || ''),
    sourceType: String(formData.get('sourceType') || ''),
    externalUrl: String(formData.get('externalUrl') || '').trim() || null,
    streamingUrl: String(formData.get('streamingUrl') || '').trim() || null,
    durationSeconds: formData.get('durationSeconds') ? Number(formData.get('durationSeconds')) : undefined,
    thumbnailUrl: String(formData.get('thumbnailUrl') || '').trim() || null,
  })
  if (!payload.success) return NextResponse.json({ error: payload.error.flatten() }, { status: 400 })

  const file = formData.get('file')
  const video = await createPhase10VideoAsset(
    id,
    payload.data,
    file instanceof File
      ? {
          name: file.name,
          type: file.type,
          buffer: Buffer.from(await file.arrayBuffer()),
        }
      : undefined
  )

  return NextResponse.json(video, { status: 201 })
}
