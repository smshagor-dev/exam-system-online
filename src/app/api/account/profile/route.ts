import { auth } from '@/lib/auth'
import { getActiveRegistrationFields, validateRegistrationFieldResponses } from '@/lib/registration-fields'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { mkdir, unlink, writeFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

const MAX_AVATAR_SIZE = 2 * 1024 * 1024
const AVATAR_DIR = path.join(process.cwd(), 'public', 'uploads', 'avatars')

function getAvatarExtension(file: File) {
  const fromType = file.type.split('/')[1]
  if (fromType) return fromType === 'jpeg' ? 'jpg' : fromType

  const fromName = file.name.split('.').pop()?.toLowerCase()
  return fromName || 'png'
}

async function deleteLocalAvatar(avatarUrl: string | null | undefined) {
  if (!avatarUrl || !avatarUrl.startsWith('/uploads/avatars/')) return

  const filePath = path.join(process.cwd(), 'public', avatarUrl.replace(/^\//, ''))
  try {
    await unlink(filePath)
  } catch {
    // Ignore missing files so profile updates are not blocked.
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatarUrl: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json(user)
}

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      avatarUrl: true,
      studentProfile: {
        select: {
          id: true,
        },
      },
    },
  })

  if (!currentUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const formData = await request.formData()
  const name = String(formData.get('name') || '').trim()
  const removeAvatar = String(formData.get('removeAvatar') || '') === 'true'
  const avatar = formData.get('avatar')
  const studentProfileRaw = formData.get('studentProfile')

  if (name.length < 2) {
    return NextResponse.json({ error: 'Name must be at least 2 characters long' }, { status: 400 })
  }

  let avatarUrl = currentUser.avatarUrl

  if (removeAvatar) {
    await deleteLocalAvatar(currentUser.avatarUrl)
    avatarUrl = null
  }

  if (avatar instanceof File && avatar.size > 0) {
    if (!avatar.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Please upload a valid image file' }, { status: 400 })
    }

    if (avatar.size > MAX_AVATAR_SIZE) {
      return NextResponse.json({ error: 'Image size must be 2MB or less' }, { status: 400 })
    }

    await mkdir(AVATAR_DIR, { recursive: true })
    const extension = getAvatarExtension(avatar)
    const fileName = `${currentUser.id}-${Date.now()}.${extension}`
    const filePath = path.join(AVATAR_DIR, fileName)
    const buffer = Buffer.from(await avatar.arrayBuffer())

    await writeFile(filePath, buffer)
    await deleteLocalAvatar(currentUser.avatarUrl)
    avatarUrl = `/uploads/avatars/${fileName}`
  }

  let studentProfileResult: {
    phone: string | null
    course: string | null
  } | null = null

  if (currentUser.role === UserRole.STUDENT && typeof studentProfileRaw === 'string') {
    if (!currentUser.studentProfile) {
      return NextResponse.json({ error: 'Student profile not found' }, { status: 404 })
    }

    let parsedStudentProfile: {
      phone?: unknown
      course?: unknown
      departmentId?: unknown
      subjectId?: unknown
      languageId?: unknown
      groupId?: unknown
      academicYearId?: unknown
      semesterId?: unknown
      customFieldResponses?: unknown
    }

    try {
      parsedStudentProfile = JSON.parse(studentProfileRaw)
    } catch {
      return NextResponse.json({ error: 'Invalid student profile payload' }, { status: 400 })
    }

    const phone = typeof parsedStudentProfile.phone === 'string' ? parsedStudentProfile.phone.trim() : ''
    const course = typeof parsedStudentProfile.course === 'string' ? parsedStudentProfile.course : ''
    const departmentId = typeof parsedStudentProfile.departmentId === 'string' ? parsedStudentProfile.departmentId : ''
    const subjectId = typeof parsedStudentProfile.subjectId === 'string' ? parsedStudentProfile.subjectId : ''
    const languageId = typeof parsedStudentProfile.languageId === 'string' ? parsedStudentProfile.languageId : ''
    const groupId = typeof parsedStudentProfile.groupId === 'string' ? parsedStudentProfile.groupId : ''
    const academicYearId = typeof parsedStudentProfile.academicYearId === 'string' ? parsedStudentProfile.academicYearId : ''
    const semesterId = typeof parsedStudentProfile.semesterId === 'string' ? parsedStudentProfile.semesterId : ''
    const customFieldResponses =
      parsedStudentProfile.customFieldResponses &&
      typeof parsedStudentProfile.customFieldResponses === 'object' &&
      !Array.isArray(parsedStudentProfile.customFieldResponses)
        ? Object.fromEntries(
            Object.entries(parsedStudentProfile.customFieldResponses as Record<string, unknown>).filter(([, value]) =>
              typeof value === 'string' || typeof value === 'boolean'
            )
          ) as Record<string, string | boolean>
        : {}

    if (!course.trim()) {
      return NextResponse.json({ error: 'Invalid course' }, { status: 400 })
    }

    if (!departmentId || !subjectId || !languageId || !groupId || !academicYearId || !semesterId) {
      return NextResponse.json({ error: 'Please complete all academic fields' }, { status: 400 })
    }

    const [dept, year, group, language, semester, subject, dynamicFields] = await Promise.all([
      prisma.department.findFirst({ where: { id: departmentId, isActive: true }, select: { id: true } }),
      prisma.academicYear.findFirst({ where: { id: academicYearId, isActive: true }, select: { id: true } }),
      prisma.group.findFirst({ where: { id: groupId, academicYearId, isActive: true }, select: { id: true } }),
      prisma.language.findFirst({ where: { id: languageId, isActive: true }, select: { id: true } }),
      prisma.semester.findFirst({ where: { id: semesterId, isActive: true }, select: { id: true } }),
      prisma.subject.findFirst({ where: { id: subjectId, departmentId, isActive: true }, select: { id: true } }),
      getActiveRegistrationFields(departmentId),
    ])

    if (!dept) return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
    if (!year) return NextResponse.json({ error: 'Invalid academic year' }, { status: 400 })
    if (!group) return NextResponse.json({ error: 'Group does not belong to this academic year' }, { status: 400 })
    if (!language) return NextResponse.json({ error: 'Invalid department language' }, { status: 400 })
    if (!semester) return NextResponse.json({ error: 'Invalid semester' }, { status: 400 })
    if (!subject) return NextResponse.json({ error: 'Subject does not belong to this department' }, { status: 400 })

    const dynamicValidation = validateRegistrationFieldResponses(dynamicFields, customFieldResponses)
    if (!dynamicValidation.valid) {
      return NextResponse.json({ error: dynamicValidation.error }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.user.id },
        data: {
          name,
          avatarUrl,
        },
      })

      await tx.studentProfile.update({
        where: { id: currentUser.studentProfile!.id },
        data: {
          departmentId,
          phone: phone || null,
          customFieldResponses: {
            course,
            ...customFieldResponses,
          },
          subjects: {
            deleteMany: {},
            create: {
              subjectId,
              languageId,
              groupId,
              academicYearId,
              semesterId,
            },
          },
        },
      })
    })

    studentProfileResult = {
      phone: phone || null,
      course,
    }
  } else {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name,
        avatarUrl,
      },
    })
  }

  const updatedUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatarUrl: true,
    },
  })

  return NextResponse.json({
    ...updatedUser,
    studentProfile: studentProfileResult,
  })
}
