import fs from 'node:fs/promises'
import path from 'node:path'
import { Phase8AttendanceMethod, Phase8AttendanceStatus, Phase8DutyRoleType, Phase8IncidentType, Phase8InvigilatorRoleType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  buildPhase8Reports,
  createIncident,
  generateScheduleForSession,
  generateSeatPlan,
  getInvigilationDashboard,
  issueAdmitCards,
  markAttendance,
} from '@/lib/phase8-scheduling'

const evidencePath = path.join(process.cwd(), 'docs/phase-8/evidence/database/phase8-platform-tests.json')

async function ensureDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

async function main() {
  const department = await prisma.department.findFirst({ where: { isActive: true } })
  const academicSession = await prisma.academicSession.findFirst({ where: { isActive: true } })
  const semester = await prisma.semester.findFirst({ where: { isActive: true } })
  const offering = await prisma.academicOffering.findFirst({
    where: { isActive: true, departmentId: department?.id },
    include: { program: true },
  })
  const teacher = await prisma.teacherProfile.findFirst({ where: { departmentId: department?.id } })
  const student = await prisma.studentProfile.findFirst({
    where: {
      subjects: offering
        ? {
            some: {
              academicOfferingId: offering.id,
            },
          }
        : undefined,
    },
  })

  if (!department || !academicSession || !semester || !offering || !teacher || !student) {
    throw new Error('Phase 8 test fixtures are incomplete. Expected active department/session/offering/teacher/student data.')
  }

  const campus = await prisma.examCampus.create({
    data: {
      departmentId: department.id,
      name: 'Phase 8 Test Campus',
      code: `P8C${Date.now().toString().slice(-5)}`,
      description: 'Temporary Phase 8 validation campus',
    },
  })

  const building = await prisma.examBuilding.create({
    data: {
      campusId: campus.id,
      name: 'Phase 8 Test Building',
      code: `P8B${Date.now().toString().slice(-5)}`,
      floors: 3,
    },
  })

  const room = await prisma.examRoom.create({
    data: {
      campusId: campus.id,
      buildingId: building.id,
      name: 'Phase 8 Test Hall',
      code: `P8R${Date.now().toString().slice(-5)}`,
      floorNumber: 1,
      capacity: 200,
      hasInternet: true,
      hasProjector: true,
    },
  })

  const calendar = await prisma.examAcademicCalendar.create({
    data: {
      academicSessionId: academicSession.id,
      departmentId: department.id,
      semesterId: semester.id,
      campusId: campus.id,
      name: 'Phase 8 Test Calendar',
      teachingStartsAt: new Date('2026-01-01T09:00:00.000Z'),
      teachingEndsAt: new Date('2026-03-01T09:00:00.000Z'),
      registrationStartsAt: new Date('2025-12-01T09:00:00.000Z'),
      registrationEndsAt: new Date('2025-12-15T09:00:00.000Z'),
      courseworkStartsAt: new Date('2026-01-02T09:00:00.000Z'),
      courseworkEndsAt: new Date('2026-04-10T09:00:00.000Z'),
      examinationStartsAt: new Date('2026-04-11T09:00:00.000Z'),
      examinationEndsAt: new Date('2026-05-11T09:00:00.000Z'),
      makeupStartsAt: new Date('2026-05-20T09:00:00.000Z'),
      makeupEndsAt: new Date('2026-05-25T09:00:00.000Z'),
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  })

  await prisma.examCalendarHoliday.create({
    data: {
      calendarId: calendar.id,
      departmentId: department.id,
      campusId: campus.id,
      name: 'Phase 8 Test Holiday',
      startsAt: new Date('2026-04-25T09:00:00.000Z'),
      endsAt: new Date('2026-04-26T09:00:00.000Z'),
      scopeType: 'CAMPUS',
    },
  })

  await prisma.examDutyAssignment.create({
    data: {
      teacherId: teacher.id,
      departmentId: department.id,
      campusId: campus.id,
      roleType: Phase8DutyRoleType.SCHEDULER,
    },
  })

  const schedulingSession = await prisma.examSchedulingSession.create({
    data: {
      academicSessionId: academicSession.id,
      departmentId: department.id,
      programId: offering.programId,
      semesterId: offering.semesterId,
      campusId: campus.id,
      name: 'Phase 8 Test Final Session',
      type: 'FINAL',
      status: 'DRAFT',
    },
  })

  const generated = await generateScheduleForSession({
    schedulingSessionId: schedulingSession.id,
    academicOfferingIds: [offering.id],
    roomIds: [room.id],
    startsAt: new Date('2026-04-20T09:00:00.000Z'),
    slotMinutes: 120,
    gapMinutes: 30,
    campusId: campus.id,
  })

  const scheduleItem = await prisma.examScheduleItem.findFirstOrThrow({
    where: { id: generated.createdIds[0] },
  })

  const seatPlan = await generateSeatPlan({
    scheduleItemId: scheduleItem.id,
    spacingPolicy: 1,
  })

  await prisma.examInvigilatorAssignment.create({
    data: {
      scheduleItemId: scheduleItem.id,
      teacherId: teacher.id,
      roleType: Phase8InvigilatorRoleType.PRIMARY,
      startsAt: scheduleItem.scheduledStart,
      endsAt: scheduleItem.scheduledEnd,
    },
  })

  const seatAssignment = await prisma.examSeatAssignment.findFirstOrThrow({
    where: {
      seatPlanId: seatPlan.seatPlanId,
      studentId: student.id,
    },
  })

  const attendance = await markAttendance({
    scheduleItemId: scheduleItem.id,
    studentId: student.id,
    roomId: room.id,
    seatAssignmentId: seatAssignment.id,
    markedByUserId: teacher.userId,
    status: Phase8AttendanceStatus.PRESENT,
    method: Phase8AttendanceMethod.MANUAL,
  })

  const incident = await createIncident({
    scheduleItemId: scheduleItem.id,
    roomId: room.id,
    reporterUserId: teacher.userId,
    studentId: student.id,
    type: Phase8IncidentType.TECHNICAL_ISSUE,
    title: 'Phase 8 validation incident',
    description: 'Temporary incident raised by platform test',
  })

  const admitCards = await issueAdmitCards(schedulingSession.id)
  const dashboard = await getInvigilationDashboard({ departmentId: department.id, teacherUserId: teacher.userId })
  const reports = await buildPhase8Reports({ departmentId: department.id, schedulingSessionId: schedulingSession.id })

  const result = {
    status: 'PASS',
    createdAt: new Date().toISOString(),
    calendarId: calendar.id,
    schedulingSessionId: schedulingSession.id,
    generatedSchedule: generated,
    seatPlan,
    attendanceId: attendance.id,
    incidentId: incident.id,
    admitCards,
    dashboardSummary: {
      runningCount: dashboard.runningCount,
      items: dashboard.runningItems.length,
    },
    reportTotals: reports.totals,
  }

  await ensureDir(evidencePath)
  await fs.writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(result, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })

