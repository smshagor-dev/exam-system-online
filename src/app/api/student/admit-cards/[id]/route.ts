import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { generateAdmitCardPdf } from '@/lib/admit-card'
import { studentCanAccessAdmitCard } from '@/lib/exam-scheduling-permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(UserRole.STUDENT)
  const { id } = await params
  const access = await studentCanAccessAdmitCard(session.user.id, id)
  if (!access.allowed) {
    return NextResponse.json({ error: access.reason ?? 'Forbidden' }, { status: 403 })
  }

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

  await prisma.examAdmitCard.update({
    where: { id },
    data: {
      lastDownloadedAt: new Date(),
    },
  })

  const studentSeatMap = new Map(
    card.schedulingSession.items.flatMap((item) =>
      (item.seatPlan?.seatAssignments ?? [])
        .filter((seat) => seat.studentId === card.studentId)
        .map((seat) => [item.id, seat] as const)
    )
  )

  const payload = {
    admitCardId: card.id,
    token: card.token,
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
      scheduleItemId: item.id,
      subject: item.subject.name,
      campus: item.campus?.name ?? item.room?.campus?.name ?? 'Unassigned',
      building: item.room?.building.name ?? 'Unassigned',
      room: item.room?.name ?? 'Unassigned',
      scheduledStart: item.scheduledStart,
      scheduledEnd: item.scheduledEnd,
      seatNumber: studentSeatMap.get(item.id)?.seatNumber ?? null,
      barcode: studentSeatMap.get(item.id)?.barcode ?? null,
      qrCode: studentSeatMap.get(item.id)?.qrCode ?? null,
      rules: [
        'Carry this admit card and a valid identity document.',
        'Arrive at least 30 minutes before the scheduled start time.',
        'Seat and room changes must be authorized by the invigilation team.',
      ],
    })),
  }

  const format = new URL(req.url).searchParams.get('format') ?? 'pdf'
  if (format === 'json') {
    return NextResponse.json(payload)
  }

  const pdf = await generateAdmitCardPdf({
    admitCardId: card.id,
    token: card.token,
    verificationCode: card.token,
    student: payload.student,
    session: payload.session,
    exams: payload.exams.map((item) => ({
      subject: item.subject,
      campus: item.campus,
      building: item.building,
      room: item.room,
      scheduledStart: item.scheduledStart,
      scheduledEnd: item.scheduledEnd,
      seatNumber: item.seatNumber,
      barcode: item.barcode,
      qrCode: item.qrCode,
    })),
  })

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: 'phase8.admit_card.downloaded',
      details: JSON.stringify({
        admitCardId: card.id,
        path: pdf.filePath,
      }),
    },
  })

  return new NextResponse(pdf.buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="admit-card-${card.id}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
