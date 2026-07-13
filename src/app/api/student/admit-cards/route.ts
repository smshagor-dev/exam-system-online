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

  const cards = await prisma.examAdmitCard.findMany({
    where: {
      studentId: profile.id,
      revokedAt: null,
    },
    include: {
      schedulingSession: {
        include: {
          items: {
            include: {
              subject: true,
              room: true,
              seatPlan: {
                include: {
                  seatAssignments: {
                    where: { studentId: profile.id },
                  },
                },
              },
            },
            orderBy: { scheduledStart: 'asc' },
          },
        },
      },
    },
    orderBy: { issuedAt: 'desc' },
  })

  return NextResponse.json(cards.map((card) => ({
    ...card,
    downloadUrl: `/api/student/admit-cards/${card.id}`,
  })))
}
