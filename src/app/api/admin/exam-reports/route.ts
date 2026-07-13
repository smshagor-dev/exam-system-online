import fs from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { Phase8AttendanceStatus } from '@prisma/client'
import { buildCsv } from '@/lib/csv'
import { buildSimplePdf, persistPrivatePdf } from '@/lib/pdf'
import { getPhase8AccessibleDepartmentIds, requirePhase8Permission } from '@/lib/phase8-route-auth'
import { prisma } from '@/lib/prisma'

type ExportRow = Record<string, string | number | null>

function toDate(value: string | null) {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function normalizeRows(type: string, payload: Awaited<ReturnType<typeof buildExportPayload>>): ExportRow[] {
  switch (type) {
    case 'schedule-summary':
      return payload.scheduleItems.map((item) => ({
        schedule_item_id: item.id,
        session: item.schedulingSession.name,
        subject: item.subject.name,
        group: item.group.name,
        room: item.room?.name ?? '',
        campus: item.campus?.name ?? '',
        start: item.scheduledStart.toISOString(),
        end: item.scheduledEnd.toISOString(),
        status: item.status,
        manual_override: item.manualOverride ? 'true' : 'false',
      }))
    case 'seat-allocation':
      return payload.seatAssignments.map((seat) => ({
        schedule_item_id: seat.seatPlan.scheduleItemId,
        student: seat.student.user.name,
        room: seat.room.name,
        seat_number: seat.seatNumber,
        accessibility_seat: seat.isAccessibilitySeat ? 'true' : 'false',
        manual_override: seat.isManualOverride ? 'true' : 'false',
      }))
    case 'invigilator-workload':
      return payload.invigilatorAssignments.map((assignment) => ({
        schedule_item_id: assignment.scheduleItemId,
        teacher: assignment.teacher.user.name,
        replacement_teacher: assignment.replacementTeacher?.user.name ?? '',
        role: assignment.roleType,
        starts_at: assignment.startsAt.toISOString(),
        ends_at: assignment.endsAt.toISOString(),
      }))
    case 'attendance':
      return payload.attendance.map((record) => ({
        schedule_item_id: record.scheduleItemId,
        student: record.student.user.name,
        status: record.status,
        method: record.method,
        room: record.room?.name ?? '',
        marked_at: record.markedAt.toISOString(),
      }))
    case 'absentees':
      return payload.attendance
        .filter((record) => record.status === Phase8AttendanceStatus.ABSENT)
        .map((record) => ({
          schedule_item_id: record.scheduleItemId,
          student: record.student.user.name,
          room: record.room?.name ?? '',
          marked_at: record.markedAt.toISOString(),
        }))
    case 'clashes':
      return payload.scheduleItems
        .filter((item) => Array.isArray(item.conflictFlagsJson) && item.conflictFlagsJson.length > 0)
        .map((item) => ({
          schedule_item_id: item.id,
          subject: item.subject.name,
          room: item.room?.name ?? '',
          start: item.scheduledStart.toISOString(),
          end: item.scheduledEnd.toISOString(),
          conflicts: Array.isArray(item.conflictFlagsJson) ? item.conflictFlagsJson.join('|') : '',
        }))
    case 'incidents':
      return payload.incidents.map((incident) => ({
        incident_id: incident.id,
        schedule_item_id: incident.scheduleItemId,
        type: incident.type,
        status: incident.status,
        student: incident.student?.user.name ?? '',
        room: incident.room?.name ?? '',
        created_at: incident.createdAt.toISOString(),
      }))
    case 'room-utilization':
    default:
      return payload.scheduleItems.map((item) => ({
        schedule_item_id: item.id,
        room: item.room?.name ?? '',
        building: item.room?.building?.name ?? '',
        campus: item.room?.campus?.name ?? item.campus?.name ?? '',
        capacity: item.room?.capacity ?? 0,
        student_count: item.studentCount,
        utilization_rate: item.room?.capacity
          ? Number(((item.studentCount / item.room.capacity) * 100).toFixed(2))
          : 0,
      }))
  }
}

async function buildExportPayload(req: NextRequest, accessibleDepartmentIds: string[] | null) {
  const { searchParams } = new URL(req.url)
  const requestedDepartmentId = searchParams.get('departmentId')
  const schedulingSessionId = searchParams.get('schedulingSessionId')
  const programId = searchParams.get('programId')
  const campusId = searchParams.get('campusId')
  const buildingId = searchParams.get('buildingId')
  const roomId = searchParams.get('roomId')
  const teacherId = searchParams.get('teacherId')
  const attendanceStatus = searchParams.get('attendanceStatus')
  const incidentType = searchParams.get('incidentType')
  const dateFrom = toDate(searchParams.get('dateFrom'))
  const dateTo = toDate(searchParams.get('dateTo'))

  const allowedDepartmentIds =
    accessibleDepartmentIds === null
      ? requestedDepartmentId
        ? [requestedDepartmentId]
        : null
      : requestedDepartmentId
        ? accessibleDepartmentIds.filter((departmentId) => departmentId === requestedDepartmentId)
        : accessibleDepartmentIds

  const scheduleWhere = {
    ...(allowedDepartmentIds === null ? {} : { departmentId: { in: allowedDepartmentIds } }),
    ...(schedulingSessionId ? { schedulingSessionId } : {}),
    ...(programId ? { programId } : {}),
    ...(campusId ? { campusId } : {}),
    ...(roomId ? { roomId } : {}),
    ...(buildingId ? { room: { buildingId } } : {}),
    ...(dateFrom || dateTo
      ? {
          scheduledStart: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lte: dateTo } : {}),
          },
        }
      : {}),
    ...(teacherId
      ? {
          invigilators: {
            some: {
              OR: [{ teacherId }, { replacementTeacherId: teacherId }],
            },
          },
        }
      : {}),
  }

  const [scheduleItems, seatAssignments, invigilatorAssignments, attendance, incidents] = await Promise.all([
    prisma.examScheduleItem.findMany({
      where: scheduleWhere,
      include: {
        schedulingSession: true,
        subject: true,
        group: true,
        campus: true,
        room: {
          include: {
            building: true,
            campus: true,
          },
        },
      },
      orderBy: { scheduledStart: 'asc' },
    }),
    prisma.examSeatAssignment.findMany({
      where: {
        seatPlan: {
          scheduleItem: scheduleWhere,
        },
      },
      include: {
        room: true,
        student: {
          include: {
            user: true,
          },
        },
        seatPlan: true,
      },
      orderBy: { seatNumber: 'asc' },
    }),
    prisma.examInvigilatorAssignment.findMany({
      where: {
        scheduleItem: scheduleWhere,
      },
      include: {
        teacher: {
          include: {
            user: true,
          },
        },
        replacementTeacher: {
          include: {
            user: true,
          },
        },
      },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.examAttendanceRecord.findMany({
      where: {
        scheduleItem: scheduleWhere,
        ...(attendanceStatus && attendanceStatus in Phase8AttendanceStatus ? { status: attendanceStatus as Phase8AttendanceStatus } : {}),
      },
      include: {
        student: {
          include: {
            user: true,
          },
        },
        room: true,
      },
      orderBy: { markedAt: 'asc' },
    }),
    prisma.examIncident.findMany({
      where: {
        scheduleItem: scheduleWhere,
        ...(incidentType ? { type: incidentType as never } : {}),
      },
      include: {
        student: {
          include: {
            user: true,
          },
        },
        room: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return {
    scheduleItems,
    seatAssignments,
    invigilatorAssignments,
    attendance,
    incidents,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const departmentId = searchParams.get('departmentId')
  const format = (searchParams.get('format') ?? 'json').toLowerCase()
  const type = (searchParams.get('type') ?? 'room-utilization').toLowerCase()
  const access = await requirePhase8Permission('reports.read', { departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const accessibleDepartmentIds = await getPhase8AccessibleDepartmentIds(access)
  const payload = await buildExportPayload(req, accessibleDepartmentIds)
  const rows = normalizeRows(type, payload)

  if (format === 'json') {
    return NextResponse.json({
      type,
      generatedAt: new Date().toISOString(),
      rowCount: rows.length,
      rows,
    })
  }

  if (format === 'csv') {
    const headers = Object.keys((rows[0] ?? { notice: 'no_rows' }) as ExportRow)
    const csv = buildCsv(
      headers,
      rows.map((row) => headers.map((header) => row[header] ?? ''))
    )
    const filePath = path.join(process.cwd(), '.generated', 'phase-8', 'reports', `${type}-${Date.now()}.csv`)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, csv, 'utf8')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="phase8-${type}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  if (format === 'pdf') {
    const headers = Object.keys((rows[0] ?? { notice: 'no_rows' }) as ExportRow)
    const lines = [
      `Phase 8 Report Export: ${type}`,
      `Generated: ${new Date().toISOString()}`,
      `Rows: ${rows.length}`,
      '',
      ...rows.slice(0, 40).map((row) => headers.map((header) => `${header}=${row[header] ?? ''}`).join(' | ')),
    ]
    const buffer = buildSimplePdf(lines)
    await persistPrivatePdf(`phase-8/reports/${type}-${Date.now()}.pdf`, buffer)
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="phase8-${type}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
}
