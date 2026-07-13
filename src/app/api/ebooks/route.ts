import { auth } from '@/lib/auth'
import { dedupeTranslations } from '@/lib/academic-content'
import { EBOOK_DIR, MAX_EBOOK_SIZE, sanitizeEbookFileName } from '@/lib/ebooks'
import { validateTeacherOfferingAccess, getTeacherProfileByUserId } from '@/lib/teacher-assignment'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can upload ebooks' }, { status: 403 })
  }

  const profile = await getTeacherProfileByUserId(session.user.id)

  if (!profile) {
    return NextResponse.json({ error: 'Teacher profile not found' }, { status: 404 })
  }

  const formData = await request.formData()
  const title = String(formData.get('title') || '').trim()
  const description = String(formData.get('description') || '').trim()
  const author = String(formData.get('author') || '').trim()
  const category = String(formData.get('category') || '').trim()
  const assignmentId = String(formData.get('assignmentId') || '').trim()
  const translationsRaw = String(formData.get('translations') || '').trim()
  const file = formData.get('file')

  if (title.length < 2) {
    return NextResponse.json({ error: 'Title must be at least 2 characters long' }, { status: 400 })
  }

  if (!assignmentId) {
    return NextResponse.json({ error: 'Please select an assignment' }, { status: 400 })
  }

  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: 'Please upload a PDF file' }, { status: 400 })
  }

  const extension = file.name.split('.').pop()?.toLowerCase()
  const isPdf = file.type === 'application/pdf' || extension === 'pdf'
  if (!isPdf) {
    return NextResponse.json({ error: 'Only PDF ebooks are allowed' }, { status: 400 })
  }

  if (file.size > MAX_EBOOK_SIZE) {
    return NextResponse.json({ error: 'PDF size must be 20MB or less' }, { status: 400 })
  }

  const assignment = await prisma.teacherAssignment.findFirst({
    where: {
      id: assignmentId,
    },
    select: {
      teacherId: true,
      departmentId: true,
      subjectId: true,
      languageId: true,
      groupId: true,
      academicYearId: true,
      semesterId: true,
      academicOfferingId: true,
    },
  })

  if (!assignment) {
    return NextResponse.json({ error: 'Assignment not found or not allowed' }, { status: 404 })
  }

  const access = await validateTeacherOfferingAccess({
    teacherProfileId: profile.id,
    academicOfferingId: assignment.academicOfferingId,
    scope: {
      departmentId: assignment.departmentId,
      subjectId: assignment.subjectId,
      languageId: assignment.languageId,
      groupId: assignment.groupId,
      academicYearId: assignment.academicYearId,
      semesterId: assignment.semesterId,
      academicOfferingId: assignment.academicOfferingId,
    },
  })

  if (!access.allowed || (assignment.teacherId !== profile.id && !access.assignment)) {
    return NextResponse.json({ error: 'Assignment not found or not allowed' }, { status: 404 })
  }

  await mkdir(EBOOK_DIR, { recursive: true })

  const safeBaseName = sanitizeEbookFileName(file.name.replace(/\.pdf$/i, ''))
  const fileName = `${assignment.teacherId}-${Date.now()}-${safeBaseName || 'ebook'}.pdf`
  const filePath = path.join(EBOOK_DIR, fileName)
  const fileUrl = `/uploads/ebooks/${fileName}`
  const buffer = Buffer.from(await file.arrayBuffer())

  await writeFile(filePath, buffer)

  let extraTranslations: Array<{
    languageId: string
    title: string
    description?: string | null
    author?: string | null
    category?: string | null
  }> = []
  if (translationsRaw) {
    try {
      const parsed = JSON.parse(translationsRaw)
      if (Array.isArray(parsed)) {
        extraTranslations = parsed
          .filter((translation) => translation && typeof translation.languageId === 'string' && typeof translation.title === 'string')
          .map((translation) => ({
            languageId: String(translation.languageId),
            title: String(translation.title),
            description:
              typeof translation.description === 'string' ? String(translation.description) : null,
            author: typeof translation.author === 'string' ? String(translation.author) : null,
            category: typeof translation.category === 'string' ? String(translation.category) : null,
          }))
      }
    } catch {
      return NextResponse.json({ error: 'Invalid ebook translations payload' }, { status: 400 })
    }
  }

  const ebook = await prisma.$transaction(async (tx) => {
    const savedEbook = await tx.ebookUpload.create({
      data: {
        teacherId: assignment.teacherId,
        departmentId: assignment.departmentId,
        subjectId: assignment.subjectId,
        languageId: assignment.languageId,
        groupId: assignment.groupId,
        academicYearId: assignment.academicYearId,
        semesterId: assignment.semesterId,
        title,
        description: description || null,
        author: author || null,
        category: category || null,
        fileName,
        fileUrl,
        fileSizeBytes: file.size,
      },
    })

    const mergedTranslations = dedupeTranslations([
      {
        languageId: assignment.languageId,
        title,
        description: description || null,
        author: author || null,
        category: category || null,
      },
      ...extraTranslations,
    ])

    for (const translation of mergedTranslations) {
      await tx.ebookUploadTranslation.upsert({
        where: {
          ebookUploadId_languageId: {
            ebookUploadId: savedEbook.id,
            languageId: translation.languageId,
          },
        },
        update: {
          title: translation.title,
          description: translation.description ?? null,
          author: translation.author ?? null,
          category: translation.category ?? null,
        },
        create: {
          ebookUploadId: savedEbook.id,
          languageId: translation.languageId,
          title: translation.title,
          description: translation.description ?? null,
          author: translation.author ?? null,
          category: translation.category ?? null,
        },
      })
    }

    return tx.ebookUpload.findUniqueOrThrow({
      where: { id: savedEbook.id },
      include: {
        subject: true,
        language: true,
        group: true,
        academicYear: true,
        semester: true,
        translations: true,
      },
    })
  })

  return NextResponse.json(ebook, { status: 201 })
}
