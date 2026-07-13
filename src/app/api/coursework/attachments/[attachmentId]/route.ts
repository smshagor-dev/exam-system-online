import { auth } from '@/lib/auth'
import { COURSEWORK_ENTERPRISE_DIR } from '@/lib/coursework-enterprise'
import { teacherHasCourseworkPermissionForPublication } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { access, readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ attachmentId: string }>
}

function resolveAttachmentStoragePath(fileUrl: string) {
  if (!fileUrl.startsWith('/uploads/coursework-enterprise/')) {
    return null
  }

  const fileName = path.basename(fileUrl)
  if (!fileName || fileName === '.' || fileName === '..') {
    return null
  }

  const resolvedPath = path.resolve(COURSEWORK_ENTERPRISE_DIR, fileName)
  const resolvedRoot = path.resolve(COURSEWORK_ENTERPRISE_DIR)
  if (!resolvedPath.startsWith(`${resolvedRoot}${path.sep}`) && resolvedPath !== path.join(resolvedRoot, fileName)) {
    return null
  }

  return {
    fileName,
    filePath: resolvedPath,
  }
}

export async function GET(_: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication is required to download coursework attachments' }, { status: 401 })
  }

  const { attachmentId } = await context.params
  const attachment = await prisma.courseworkAttemptAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      student: {
        select: {
          id: true,
          userId: true,
          departmentId: true,
        },
      },
      attempt: {
        select: {
          publicationId: true,
        },
      },
    },
  })

  if (!attachment) {
    return NextResponse.json({ error: 'Coursework attachment not found' }, { status: 404 })
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  })
  if (!dbUser?.isActive) {
    return NextResponse.json({ error: 'Your account is not allowed to access coursework attachments' }, { status: 403 })
  }

  if (dbUser.role === UserRole.STUDENT) {
    if (attachment.student.userId !== session.user.id) {
      return NextResponse.json({ error: 'You do not own this coursework attachment' }, { status: 403 })
    }
  } else if (dbUser.role === UserRole.TEACHER || dbUser.role === UserRole.DEPARTMENT_ADMIN || dbUser.role === UserRole.SUPER_ADMIN) {
    const allowed = await teacherHasCourseworkPermissionForPublication(
      { userId: session.user.id, role: dbUser.role },
      'coursework.read',
      attachment.attempt.publicationId
    )
    if (!allowed) {
      return NextResponse.json({ error: 'You do not have permission to access this coursework attachment' }, { status: 403 })
    }
  } else {
    return NextResponse.json({ error: 'Unsupported role for coursework attachment access' }, { status: 403 })
  }

  const storedFile = resolveAttachmentStoragePath(attachment.fileUrl)
  if (!storedFile) {
    return NextResponse.json({ error: 'Stored attachment path is invalid' }, { status: 400 })
  }

  try {
    await access(storedFile.filePath)
  } catch {
    return NextResponse.json({ error: 'Stored attachment file is missing' }, { status: 404 })
  }

  const fileBuffer = await readFile(storedFile.filePath)
  return new NextResponse(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      'Content-Type': attachment.mimeType || 'application/octet-stream',
      'Content-Length': String(attachment.fileSizeBytes),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
