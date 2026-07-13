import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase10Permission } from '@/lib/phase10-route-auth'
import { uploadPhase10LessonMaterial } from '@/lib/phase10-lms'
import { validatePhase10MaterialUpload } from '@/lib/phase10-upload-security'
import { phase10MaterialCreateSchema } from '@/lib/phase10-validators'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params
  const lesson = await prisma.phase10Lesson.findUnique({
    where: { id },
    include: {
      course: {
        include: {
          academicOffering: true,
        },
      },
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
  const payload = phase10MaterialCreateSchema.safeParse({
    type: String(formData.get('type') || ''),
    title: String(formData.get('title') || ''),
    description: String(formData.get('description') || '').trim() || null,
    externalUrl: String(formData.get('externalUrl') || '').trim() || null,
    richText: String(formData.get('richText') || '').trim() || null,
    scormManifestUrl: String(formData.get('scormManifestUrl') || '').trim() || null,
    scormLaunchUrl: String(formData.get('scormLaunchUrl') || '').trim() || null,
    sortOrder: formData.get('sortOrder') ? Number(formData.get('sortOrder')) : undefined,
    translations: formData.get('translations') ? JSON.parse(String(formData.get('translations'))) : undefined,
  })
  if (!payload.success) return NextResponse.json({ error: payload.error.flatten() }, { status: 400 })

  const file = formData.get('file')
  if (file instanceof File) {
    try {
      validatePhase10MaterialUpload({
        name: file.name,
        type: file.type,
        size: file.size,
      })
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid LMS material upload' },
        { status: 400 }
      )
    }
  }

  const material = await uploadPhase10LessonMaterial(
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

  return NextResponse.json(material, { status: 201 })
}
