import { NextRequest, NextResponse } from 'next/server'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')?.trim()
  const scheduleItemId = searchParams.get('scheduleItemId')?.trim() ?? undefined
  if (!token) {
    return NextResponse.json({ error: 'Verification token is required' }, { status: 400 })
  }

  const seat = await prisma.examSeatAssignment.findFirst({
    where: {
      OR: [{ qrCode: token }, { barcode: token }],
      ...(scheduleItemId
        ? {
            seatPlan: {
              scheduleItemId,
            },
          }
        : {}),
    },
    include: {
      room: {
        include: {
          building: true,
          campus: true,
        },
      },
      student: {
        include: {
          user: true,
          department: true,
        },
      },
      seatPlan: {
        include: {
          scheduleItem: {
            include: {
              subject: true,
              schedulingSession: true,
            },
          },
        },
      },
    },
  })

  if (seat) {
    const access = await requirePhase8Permission('attendance.manage', {
      departmentId: seat.student.departmentId,
      campusId: seat.room.campusId,
    })
    if (!access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      valid: true,
      verificationType: token === seat.qrCode ? 'QR' : 'BARCODE',
      student: {
        name: seat.student.user.name,
        email: seat.student.user.email,
        department: seat.student.department.name,
      },
      session: {
        name: seat.seatPlan.scheduleItem.schedulingSession.name,
        type: seat.seatPlan.scheduleItem.schedulingSession.type,
        status: seat.seatPlan.scheduleItem.schedulingSession.status,
      },
      seats: [
        {
          subject: seat.seatPlan.scheduleItem.subject.name,
          room: seat.room.name,
          building: seat.room.building.name,
          campus: seat.room.campus.name,
          seatNumber: seat.seatNumber,
          barcode: seat.barcode,
          qrCode: seat.qrCode,
        },
      ],
    })
  }

  const card = await prisma.examAdmitCard.findUnique({
    where: { token },
    include: {
      schedulingSession: true,
      student: {
        include: {
          user: true,
          department: true,
        },
      },
    },
  })

  if (!card) {
    return NextResponse.json({ error: 'Verification token is invalid' }, { status: 404 })
  }

  const access = await requirePhase8Permission('attendance.manage', {
    departmentId: card.student.departmentId,
  })
  if (!access) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const seats = await prisma.examSeatAssignment.findMany({
    where: {
      studentId: card.studentId,
      seatPlan: {
        scheduleItem: {
          schedulingSessionId: card.schedulingSessionId,
        },
      },
    },
    include: {
      room: {
        include: {
          building: true,
          campus: true,
        },
      },
      seatPlan: {
        include: {
          scheduleItem: {
            include: {
              subject: true,
            },
          },
        },
      },
    },
  })

  return NextResponse.json({
    valid: true,
    verificationType: 'ADMIT_CARD',
    student: {
      name: card.student.user.name,
      email: card.student.user.email,
      department: card.student.department.name,
    },
    session: {
      name: card.schedulingSession.name,
      type: card.schedulingSession.type,
      status: card.schedulingSession.status,
    },
    seats: seats.map((seat) => ({
      subject: seat.seatPlan.scheduleItem.subject.name,
      room: seat.room.name,
      building: seat.room.building.name,
      campus: seat.room.campus.name,
      seatNumber: seat.seatNumber,
      barcode: seat.barcode,
      qrCode: seat.qrCode,
    })),
  })
}
