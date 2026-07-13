import { NextRequest, NextResponse } from 'next/server'
import { generateAdmitCardPdf } from '@/lib/admit-card'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'
import { prisma } from '@/lib/prisma'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const card = await prisma.examAdmitCard.findUnique({
    where: { id },
    include: {
      student: {
        include: {
          user: true,
          department: true,
          enrollments: {
            where: {
              status: 'ACTIVE',
              isActive: true,
            },
            include: {
              program: true,
              academicSession: true,
            },
            take: 1,
          },
        },
      },
      schedulingSession: {
        include: {
          items: {
            include: {
              subject: true,
              campus: true,
              room: {
                include: {
                  building: true,
                  campus: true,
                },
              },
              seatPlan: {
                include: {
                  seatAssignments: true,
                },
              },
            },
            orderBy: { scheduledStart: 'asc' },
          },
        },
      },
    },
  })

  if (!card) {
    return NextResponse.json({ error: 'Admit card not found' }, { status: 404 })
  }

  const access = await requirePhase8Permission('exam.schedule.manage', {
    departmentId: card.student.departmentId,
  })
  if (!access) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const studentSeatMap = new Map(
    card.schedulingSession.items.flatMap((item) =>
      (item.seatPlan?.seatAssignments ?? [])
        .filter((seat) => seat.studentId === card.studentId)
        .map((seat) => [item.id, seat] as const)
    )
  )

  const pdf = await generateAdmitCardPdf({
    admitCardId: card.id,
    token: card.token,
    verificationCode: card.token,
    student: {
      name: card.student.user.name,
      email: card.student.user.email,
      department: card.student.department.name,
      program: card.student.enrollments[0]?.program.name ?? 'Unknown Program',
      academicSession: card.student.enrollments[0]?.academicSession.name ?? 'Unknown Session',
    },
    session: {
      name: card.schedulingSession.name,
      type: card.schedulingSession.type,
      issuedAt: card.issuedAt,
    },
    exams: card.schedulingSession.items.map((item) => ({
      subject: item.subject.name,
      campus: item.campus?.name ?? item.room?.campus?.name ?? 'Unassigned',
      building: item.room?.building.name ?? 'Unassigned',
      room: item.room?.name ?? 'Unassigned',
      scheduledStart: item.scheduledStart,
      scheduledEnd: item.scheduledEnd,
      seatNumber: studentSeatMap.get(item.id)?.seatNumber ?? null,
      barcode: studentSeatMap.get(item.id)?.barcode ?? null,
      qrCode: studentSeatMap.get(item.id)?.qrCode ?? null,
    })),
  })

  await prisma.activityLog.create({
    data: {
      userId: access.session.user.id,
      action: 'phase8.admit_card.regenerated',
      details: JSON.stringify({
        admitCardId: card.id,
        path: pdf.filePath,
      }),
    },
  })

  return NextResponse.json({
    ok: true,
    admitCardId: card.id,
    storedPath: pdf.filePath,
  })
}
