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

  const results = await prisma.phase9ResultRecord.findMany({
    where: {
      studentId: profile.id,
      status: {
        in: ['PUBLISHED', 'ARCHIVED'],
      },
    },
    include: {
      semester: true,
      gradebook: {
        include: {
          academicOffering: {
            include: {
              subject: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(results)
}
