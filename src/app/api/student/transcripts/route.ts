import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export async function GET() {
  const session = await requireRole(UserRole.STUDENT)
  const profile = await prisma.studentProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!profile) return NextResponse.json({ error: 'Student profile not found' }, { status: 404 })

  const transcripts = await prisma.phase9TranscriptRecord.findMany({
    where: {
      studentId: profile.id,
      status: {
        not: 'REVOKED',
      },
    },
    orderBy: { generatedAt: 'desc' },
  })

  return NextResponse.json(
    transcripts.map((record) => ({
      ...record,
      downloadUrl: `/api/student/transcripts/${record.id}`,
    }))
  )
}
