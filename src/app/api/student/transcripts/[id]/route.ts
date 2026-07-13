import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const session = await requireRole(UserRole.STUDENT)
  const { id } = await params
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return NextResponse.json({ error: 'Student profile not found' }, { status: 404 })

  const transcript = await prisma.phase9TranscriptRecord.findUnique({
    where: { id },
  })
  if (!transcript || transcript.studentId !== profile.id) {
    return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
  }
  if (transcript.status === 'REVOKED') {
    return NextResponse.json({ error: 'Transcript is revoked' }, { status: 403 })
  }

  const buffer = await fs.readFile(transcript.filePath)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="transcript-${transcript.id}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
