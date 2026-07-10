import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { unlink } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

async function deleteLocalEbook(fileUrl: string) {
  if (!fileUrl.startsWith('/uploads/ebooks/')) return

  const filePath = path.join(process.cwd(), 'public', fileUrl.replace(/^\//, ''))
  try {
    await unlink(filePath)
  } catch {
    // Ignore missing files during cleanup.
  }
}

type RouteProps = {
  params: Promise<{
    id: string
  }>
}

export async function DELETE(_: Request, { params }: RouteProps) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can delete ebooks' }, { status: 403 })
  }

  const { id } = await params

  const profile = await prisma.teacherProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })

  if (!profile) {
    return NextResponse.json({ error: 'Teacher profile not found' }, { status: 404 })
  }

  const ebook = await prisma.ebookUpload.findFirst({
    where: {
      id,
      teacherId: profile.id,
    },
    select: {
      id: true,
      fileUrl: true,
    },
  })

  if (!ebook) {
    return NextResponse.json({ error: 'Ebook not found' }, { status: 404 })
  }

  await prisma.ebookUpload.delete({
    where: { id: ebook.id },
  })
  await deleteLocalEbook(ebook.fileUrl)

  return NextResponse.json({ success: true })
}
