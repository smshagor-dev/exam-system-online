import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePhase8Permission } from '@/lib/phase8-route-auth'
import { markAttendance } from '@/lib/phase8-scheduling'
import { examAttendanceSchema } from '@/lib/phase8-validators'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await prisma.examScheduleItem.findUnique({
    where: { id },
    select: { departmentId: true, campusId: true },
  })
  if (!item) return NextResponse.json({ error: 'Schedule item not found' }, { status: 404 })
  const access = await requirePhase8Permission('attendance.manage', { departmentId: item.departmentId, campusId: item.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const records = await prisma.examAttendanceRecord.findMany({
    where: { scheduleItemId: id },
    include: {
      student: {
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      },
      room: true,
      seatAssignment: true,
    },
    orderBy: [{ markedAt: 'desc' }],
  })
  return NextResponse.json(records)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await prisma.examScheduleItem.findUnique({
    where: { id },
    select: { departmentId: true, campusId: true, roomId: true },
  })
  if (!item) return NextResponse.json({ error: 'Schedule item not found' }, { status: 404 })
  const access = await requirePhase8Permission('attendance.manage', { departmentId: item.departmentId, campusId: item.campusId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const parsed = examAttendanceSchema.safeParse({
    ...body,
    scheduleItemId: id,
    markedByUserId: access.session.user.id,
  })
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  let resolvedStudentId = parsed.data.studentId
  let resolvedSeatAssignmentId = parsed.data.seatAssignmentId ?? null
  let resolvedRoomId = parsed.data.roomId ?? item.roomId ?? null

  if (
    typeof body.verificationCode === 'string' &&
    (parsed.data.method === 'QR' || parsed.data.method === 'BARCODE')
  ) {
    const assignment = await prisma.examSeatAssignment.findFirst({
      where: {
        seatPlan: {
          scheduleItemId: id,
        },
        ...(parsed.data.method === 'QR'
          ? { qrCode: body.verificationCode }
          : { barcode: body.verificationCode }),
      },
      select: {
        id: true,
        studentId: true,
        roomId: true,
      },
    })
    if (!assignment) {
      return NextResponse.json({ error: 'Invalid verification code for this exam hall' }, { status: 409 })
    }
    resolvedStudentId = assignment.studentId
    resolvedSeatAssignmentId = assignment.id
    resolvedRoomId = assignment.roomId
  }

  const seatAssignment = await prisma.examSeatAssignment.findFirst({
    where: {
      seatPlan: {
        scheduleItemId: id,
      },
      studentId: resolvedStudentId,
      ...(resolvedSeatAssignmentId ? { id: resolvedSeatAssignmentId } : {}),
    },
    select: {
      id: true,
      studentId: true,
      roomId: true,
    },
  })

  if (!seatAssignment) {
    return NextResponse.json({ error: 'Student is not assigned to this exam hall or seat plan' }, { status: 409 })
  }

  if (resolvedRoomId && seatAssignment.roomId !== resolvedRoomId) {
    return NextResponse.json({ error: 'Attendance room does not match the assigned hall' }, { status: 409 })
  }

  const existingRecord = await prisma.examAttendanceRecord.findUnique({
    where: {
      scheduleItemId_studentId: {
        scheduleItemId: id,
        studentId: resolvedStudentId,
      },
    },
  })

  const isCorrection =
    existingRecord !== null &&
    (existingRecord.status !== parsed.data.status ||
      existingRecord.method !== parsed.data.method ||
      existingRecord.seatAssignmentId !== seatAssignment.id)

  if (isCorrection && !parsed.data.notes?.trim()) {
    return NextResponse.json({ error: 'Attendance correction requires a reason in notes' }, { status: 409 })
  }

  const record = await markAttendance({
    scheduleItemId: id,
    studentId: resolvedStudentId,
    roomId: resolvedRoomId,
    seatAssignmentId: seatAssignment.id,
    markedByUserId: access.session.user.id,
    status: parsed.data.status,
    method: parsed.data.method,
    arrivedAt: parsed.data.arrivedAt ? new Date(parsed.data.arrivedAt) : null,
    notes: parsed.data.notes ?? null,
  })

  if (isCorrection) {
    await prisma.activityLog.create({
      data: {
        userId: access.session.user.id,
        action: 'phase8.attendance.corrected',
        details: JSON.stringify({
          scheduleItemId: id,
          studentId: resolvedStudentId,
          previousStatus: existingRecord?.status ?? null,
          nextStatus: parsed.data.status,
          notes: parsed.data.notes ?? null,
        }),
      },
    })
  }

  return NextResponse.json(record)
}
