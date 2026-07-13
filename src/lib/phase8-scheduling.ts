import {
  Phase8AttendanceMethod,
  Phase8AttendanceStatus,
  Phase8IncidentType,
  Phase8IncidentStatus,
  Phase8ScheduleLifecycleStatus,
  Prisma,
  type PrismaClient,
} from '@prisma/client'
import { prisma } from './prisma'

type DbClient = PrismaClient | Prisma.TransactionClient

function getDb(client?: DbClient) {
  return client ?? prisma
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && startB < endA
}

function seatLabel(index: number) {
  const row = String.fromCharCode(65 + Math.floor(index / 50))
  const col = (index % 50) + 1
  return `${row}${col}`
}

function buildSeatToken(prefix: string, scheduleItemId: string, studentId: string, index: number) {
  return `${prefix}-${scheduleItemId.slice(-6)}-${studentId.slice(-6)}-${index + 1}`
}

async function createNotification(input: {
  userId: string
  title: string
  message: string
  link?: string | null
  type?: string
}) {
  const existing = await prisma.notification.findFirst({
    where: {
      userId: input.userId,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      type: input.type ?? 'info',
      createdAt: {
        gte: new Date(Date.now() - 5 * 60_000),
      },
    },
    select: {
      id: true,
    },
  })
  if (existing) {
    return existing
  }

  return prisma.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      type: input.type ?? 'info',
    },
  })
}

export async function detectScheduleConflicts(
  input: {
    schedulingSessionId: string
    scheduleItemId?: string
    departmentId: string
    roomId?: string | null
    groupId: string
    scheduledStart: Date
    scheduledEnd: Date
  },
  client?: DbClient
) {
  const db = getDb(client)
  const candidates = await db.examScheduleItem.findMany({
    where: {
      departmentId: input.departmentId,
      id: input.scheduleItemId ? { not: input.scheduleItemId } : undefined,
      status: { in: [Phase8ScheduleLifecycleStatus.SCHEDULED, Phase8ScheduleLifecycleStatus.PUBLISHED, Phase8ScheduleLifecycleStatus.LOCKED, Phase8ScheduleLifecycleStatus.RUNNING] },
      OR: [
        { groupId: input.groupId },
        ...(input.roomId ? [{ roomId: input.roomId }] : []),
      ],
    },
    select: {
      id: true,
      groupId: true,
      roomId: true,
      scheduledStart: true,
      scheduledEnd: true,
    },
  })

  const conflicts = candidates.filter((item) =>
    overlaps(input.scheduledStart, input.scheduledEnd, item.scheduledStart, item.scheduledEnd)
  )

  return {
    hasConflict: conflicts.length > 0,
    studentGroupConflicts: conflicts.filter((item) => item.groupId === input.groupId).map((item) => item.id),
    roomConflicts: input.roomId ? conflicts.filter((item) => item.roomId === input.roomId).map((item) => item.id) : [],
  }
}

export async function detectHolidayConflict(
  input: {
    academicSessionId: string
    departmentId: string
    campusId?: string | null
    scheduledStart: Date
    scheduledEnd: Date
  },
  client?: DbClient
) {
  const db = getDb(client)
  const calendars = await db.examAcademicCalendar.findMany({
    where: {
      academicSessionId: input.academicSessionId,
      OR: [
        { departmentId: input.departmentId },
        { departmentId: null },
      ],
    },
    select: {
      id: true,
      holidays: {
        where: {
          OR: [
            { departmentId: input.departmentId },
            { departmentId: null },
          ],
        },
        select: {
          id: true,
          name: true,
          startsAt: true,
          endsAt: true,
          campusId: true,
        },
      },
    },
  })

  const holiday = calendars
    .flatMap((calendar) => calendar.holidays)
    .find((item) =>
      (!item.campusId || item.campusId === input.campusId) &&
      overlaps(input.scheduledStart, input.scheduledEnd, item.startsAt, item.endsAt)
    )

  return {
    hasConflict: Boolean(holiday),
    holiday,
  }
}

export async function generateScheduleForSession(
  input: {
    schedulingSessionId: string
    academicOfferingIds: string[]
    roomIds: string[]
    startsAt: Date
    slotMinutes: number
    gapMinutes: number
    campusId?: string | null
  },
  client?: DbClient
) {
  const db = getDb(client)
  const session = await db.examSchedulingSession.findUnique({
    where: { id: input.schedulingSessionId },
    include: {
      academicSession: true,
      items: true,
    },
  })

  if (!session) {
    throw new Error('Scheduling session not found')
  }

  const [offerings, rooms] = await Promise.all([
    db.academicOffering.findMany({
      where: {
        id: { in: input.academicOfferingIds },
        departmentId: session.departmentId,
        isActive: true,
      },
      include: {
        exams: {
          where: {
            status: { in: ['SCHEDULED', 'LIVE', 'COMPLETED'] },
          },
          orderBy: { startTime: 'asc' },
          take: 1,
        },
        group: true,
        subject: true,
        language: true,
        semester: true,
        program: true,
      },
      orderBy: [{ semesterId: 'asc' }, { subjectId: 'asc' }],
    }),
    db.examRoom.findMany({
      where: {
        id: { in: input.roomIds },
        isActive: true,
        isMaintenance: false,
      },
      orderBy: [{ capacity: 'asc' }, { code: 'asc' }],
    }),
  ])

  if (rooms.length === 0) {
    throw new Error('No eligible rooms available for generation')
  }

  let slotStart = new Date(input.startsAt)
  const createdIds: string[] = []

  for (const offering of offerings) {
    const studentCount = await db.studentSubject.count({
      where: offering.id
        ? {
            academicOfferingId: offering.id,
          }
        : {
            subjectId: offering.subjectId,
            languageId: offering.languageId,
            groupId: offering.groupId,
            academicYearId: offering.programYearId,
            semesterId: offering.semesterId,
          },
    })

    const exam = offering.exams[0] ?? null
    const durationMinutes = exam?.duration ?? input.slotMinutes
    const room = rooms.find((candidate) => candidate.capacity >= Math.max(studentCount, 1))

    if (!room) {
      throw new Error(`No room can accommodate ${offering.subject.name} (${studentCount} students)`)
    }

    let scheduledStart = new Date(slotStart)
    let scheduledEnd = new Date(slotStart.getTime() + durationMinutes * 60_000)

    while (true) {
      const [scheduleConflict, holidayConflict] = await Promise.all([
        detectScheduleConflicts(
          {
            schedulingSessionId: session.id,
            departmentId: session.departmentId,
            roomId: room.id,
            groupId: offering.groupId,
            scheduledStart,
            scheduledEnd,
          },
          db
        ),
        detectHolidayConflict(
          {
            academicSessionId: session.academicSessionId,
            departmentId: session.departmentId,
            campusId: input.campusId ?? room.campusId,
            scheduledStart,
            scheduledEnd,
          },
          db
        ),
      ])

      if (!scheduleConflict.hasConflict && !holidayConflict.hasConflict) {
        break
      }

      scheduledStart = new Date(scheduledEnd.getTime() + input.gapMinutes * 60_000)
      scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60_000)
    }

    const created = await db.examScheduleItem.create({
      data: {
        schedulingSessionId: session.id,
        examId: exam?.id ?? null,
        academicOfferingId: offering.id,
        departmentId: offering.departmentId,
        programId: offering.programId,
        subjectId: offering.subjectId,
        languageId: offering.languageId,
        groupId: offering.groupId,
        academicYearId: offering.programYearId,
        semesterId: offering.semesterId,
        campusId: input.campusId ?? room.campusId,
        roomId: room.id,
        scheduledStart,
        scheduledEnd,
        durationMinutes,
        studentCount,
        manualOverride: false,
      },
    })

    createdIds.push(created.id)
    slotStart = new Date(scheduledEnd.getTime() + input.gapMinutes * 60_000)
  }

  return {
    createdCount: createdIds.length,
    createdIds,
  }
}

export async function generateSeatPlan(
  input: {
    scheduleItemId: string
    spacingPolicy: number
    notes?: string | null
    generatedByUserId?: string | null
  },
  client?: DbClient
) {
  void client
  const db = prisma
  const scheduleItem = await db.examScheduleItem.findUnique({
    where: { id: input.scheduleItemId },
    include: {
      room: true,
      academicOffering: true,
    },
  })

  if (!scheduleItem) {
    throw new Error('Schedule item not found')
  }
  if (!scheduleItem.room) {
    throw new Error('Schedule item has no assigned room')
  }

  const students = await db.studentProfile.findMany({
    where: {
      subjects: scheduleItem.academicOfferingId
        ? {
            some: {
              academicOfferingId: scheduleItem.academicOfferingId,
            },
          }
        : {
            some: {
              subjectId: scheduleItem.subjectId,
              languageId: scheduleItem.languageId,
              groupId: scheduleItem.groupId,
              academicYearId: scheduleItem.academicYearId,
              semesterId: scheduleItem.semesterId,
            },
          },
    },
    include: {
      user: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  const effectiveCapacity = Math.max(1, Math.floor(scheduleItem.room.capacity / input.spacingPolicy))
  if (students.length > effectiveCapacity) {
    throw new Error(`Room capacity exceeded for spacing policy ${input.spacingPolicy}`)
  }

  return prisma.$transaction(async (tx) => {
    await tx.examSeatAssignment.deleteMany({
      where: {
        seatPlan: {
          scheduleItemId: scheduleItem.id,
        },
      },
    })

    const plan = await tx.examSeatPlan.upsert({
      where: { scheduleItemId: scheduleItem.id },
      create: {
        scheduleItemId: scheduleItem.id,
        spacingPolicy: input.spacingPolicy,
        generatedByUserId: input.generatedByUserId ?? null,
        notes: input.notes ?? null,
      },
      update: {
        spacingPolicy: input.spacingPolicy,
        generatedByUserId: input.generatedByUserId ?? null,
        notes: input.notes ?? null,
        generatedAt: new Date(),
      },
    })

    for (let index = 0; index < students.length; index += 1) {
      await tx.examSeatAssignment.create({
        data: {
          seatPlanId: plan.id,
          roomId: scheduleItem.roomId!,
          studentId: students[index].id,
          seatNumber: seatLabel(index),
          rowLabel: seatLabel(index).replace(/\d+$/, ''),
          columnNumber: Number(seatLabel(index).match(/\d+$/)?.[0] ?? index + 1),
          barcode: buildSeatToken('BAR', scheduleItem.id, students[index].id, index),
          qrCode: buildSeatToken('QR', scheduleItem.id, students[index].id, index),
        },
      })
    }

    await tx.examScheduleItem.update({
      where: { id: scheduleItem.id },
      data: {
        seatPlanGeneratedAt: new Date(),
      },
    })

    return {
      seatPlanId: plan.id,
      assignedCount: students.length,
    }
  })
}

export async function issueAdmitCards(schedulingSessionId: string, client?: DbClient) {
  const db = getDb(client)
  const session = await db.examSchedulingSession.findUnique({
    where: { id: schedulingSessionId },
    include: {
      items: true,
    },
  })

  if (!session) {
    throw new Error('Scheduling session not found')
  }

  const studentIdSet = new Set<string>()
  for (const item of session.items) {
    const seatAssignments = await db.examSeatAssignment.findMany({
      where: {
        seatPlan: {
          scheduleItemId: item.id,
        },
      },
      select: {
        studentId: true,
      },
    })

    seatAssignments.forEach((assignment) => studentIdSet.add(assignment.studentId))
  }

  const ids = Array.from(studentIdSet)
  for (const studentId of ids) {
    await db.examAdmitCard.upsert({
      where: {
        schedulingSessionId_studentId: {
          schedulingSessionId,
          studentId,
        },
      },
      create: {
        schedulingSessionId,
        studentId,
        token: `ADMIT-${schedulingSessionId.slice(-6)}-${studentId.slice(-6)}`,
      },
      update: {},
    })
  }

  return {
    issuedCount: ids.length,
  }
}

export async function markAttendance(
  input: {
    scheduleItemId: string
    studentId: string
    roomId?: string | null
    seatAssignmentId?: string | null
    markedByUserId: string
    status: Phase8AttendanceStatus
    method: Phase8AttendanceMethod
    arrivedAt?: Date | null
    notes?: string | null
  },
  client?: DbClient
) {
  void client
  return prisma.$transaction(async (tx) => {
    const record = await tx.examAttendanceRecord.upsert({
      where: {
        scheduleItemId_studentId: {
          scheduleItemId: input.scheduleItemId,
          studentId: input.studentId,
        },
      },
      create: {
        scheduleItemId: input.scheduleItemId,
        studentId: input.studentId,
        roomId: input.roomId ?? null,
        seatAssignmentId: input.seatAssignmentId ?? null,
        markedByUserId: input.markedByUserId,
        status: input.status,
        method: input.method,
        arrivedAt: input.arrivedAt ?? null,
        notes: input.notes ?? null,
      },
      update: {
        roomId: input.roomId ?? null,
        seatAssignmentId: input.seatAssignmentId ?? null,
        markedByUserId: input.markedByUserId,
        status: input.status,
        method: input.method,
        arrivedAt: input.arrivedAt ?? null,
        notes: input.notes ?? null,
        markedAt: new Date(),
      },
    })

    await tx.activityLog.create({
      data: {
        userId: input.markedByUserId,
        action: 'phase8.attendance.marked',
        details: JSON.stringify({
          scheduleItemId: input.scheduleItemId,
          studentId: input.studentId,
          status: input.status,
        }),
      },
    })

    return record
  })
}

export async function createIncident(
  input: {
    scheduleItemId: string
    roomId?: string | null
    reporterUserId: string
    studentId?: string | null
    type: Phase8IncidentType
    title: string
    description: string
    attachmentUrls?: string[] | null
  },
  client?: DbClient
) {
  const db = getDb(client)
  const incident = await db.examIncident.create({
    data: {
      scheduleItemId: input.scheduleItemId,
      roomId: input.roomId ?? null,
      reporterUserId: input.reporterUserId,
      studentId: input.studentId ?? null,
      type: input.type,
      title: input.title,
      description: input.description,
      attachmentUrls: input.attachmentUrls ?? [],
    },
  })

  await db.activityLog.create({
    data: {
      userId: input.reporterUserId,
      action: 'phase8.incident.created',
      details: JSON.stringify({
        incidentId: incident.id,
        scheduleItemId: input.scheduleItemId,
        type: input.type,
      }),
    },
  })

  return incident
}

export async function getInvigilationDashboard(input: { departmentId?: string; teacherUserId?: string }) {
  const teacherProfile = input.teacherUserId
    ? await prisma.teacherProfile.findUnique({
        where: { userId: input.teacherUserId },
        select: { id: true },
      })
    : null

  const runningItems = await prisma.examScheduleItem.findMany({
    where: {
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      status: { in: [Phase8ScheduleLifecycleStatus.PUBLISHED, Phase8ScheduleLifecycleStatus.LOCKED, Phase8ScheduleLifecycleStatus.RUNNING] },
      ...(teacherProfile
        ? {
            invigilators: {
              some: {
                OR: [
                  { teacherId: teacherProfile.id },
                  { replacementTeacherId: teacherProfile.id },
                ],
              },
            },
          }
        : {}),
    },
    include: {
      subject: true,
      group: true,
      room: true,
      invigilators: {
        include: {
          teacher: {
            include: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
      attendanceRecords: true,
      incidents: true,
      exam: {
        select: {
          id: true,
          status: true,
          attempts: {
            select: {
              id: true,
              studentId: true,
              status: true,
              warningCount: true,
              reconnectCount: true,
            },
          },
        },
      },
    },
    orderBy: { scheduledStart: 'asc' },
  })

  return {
    runningCount: runningItems.length,
    runningItems: runningItems.map((item) => ({
      id: item.id,
      subjectName: item.subject.name,
      groupName: item.group.name,
      roomName: item.room?.name ?? 'Unassigned',
      scheduledStart: item.scheduledStart,
      scheduledEnd: item.scheduledEnd,
      invigilators: item.invigilators.map((assignment) => ({
        id: assignment.id,
        roleType: assignment.roleType,
        teacherName: assignment.teacher.user.name,
      })),
      attendance: {
        present: item.attendanceRecords.filter((record) => record.status === Phase8AttendanceStatus.PRESENT).length,
        absent: item.attendanceRecords.filter((record) => record.status === Phase8AttendanceStatus.ABSENT).length,
        late: item.attendanceRecords.filter((record) => record.status === Phase8AttendanceStatus.LATE).length,
        medical: item.attendanceRecords.filter((record) => record.status === Phase8AttendanceStatus.MEDICAL_EXCUSED).length,
      },
      incidents: item.incidents.length,
      disconnectedStudents: item.exam?.attempts.filter((attempt) => attempt.status === 'IN_PROGRESS' && attempt.reconnectCount > 0).length ?? 0,
      malpracticeWarnings: item.exam?.attempts.reduce((sum, attempt) => sum + attempt.warningCount, 0) ?? 0,
    })),
  }
}

export async function buildPhase8Reports(input: { departmentId?: string; schedulingSessionId?: string }) {
  const where: Prisma.ExamScheduleItemWhereInput = {
    ...(input.departmentId ? { departmentId: input.departmentId } : {}),
    ...(input.schedulingSessionId ? { schedulingSessionId: input.schedulingSessionId } : {}),
  }

  const [items, incidents, attendance] = await Promise.all([
    prisma.examScheduleItem.findMany({
      where,
      include: {
        room: true,
        invigilators: true,
      },
    }),
    prisma.examIncident.findMany({
      where: {
        scheduleItem: where,
      },
    }),
    prisma.examAttendanceRecord.findMany({
      where: {
        scheduleItem: where,
      },
    }),
  ])

  const roomUtilization = items.map((item) => ({
    scheduleItemId: item.id,
    roomId: item.roomId,
    capacity: item.room?.capacity ?? 0,
    studentCount: item.studentCount,
    utilizationRate: item.room?.capacity ? Number(((item.studentCount / item.room.capacity) * 100).toFixed(2)) : 0,
  }))

  const invigilatorWorkload = items.flatMap((item) =>
    item.invigilators.map((assignment) => ({
      teacherId: assignment.teacherId,
      roleType: assignment.roleType,
      scheduleItemId: item.id,
      durationMinutes: item.durationMinutes,
    }))
  )

  return {
    totals: {
      scheduleItems: items.length,
      incidents: incidents.length,
      attendanceMarks: attendance.length,
      absentees: attendance.filter((record) => record.status === Phase8AttendanceStatus.ABSENT).length,
      clashes: items.filter((item) => Array.isArray(item.conflictFlagsJson) ? item.conflictFlagsJson.length > 0 : Boolean(item.conflictFlagsJson)).length,
    },
    roomUtilization,
    invigilatorWorkload,
    attendance,
    incidents,
  }
}

export async function notifySchedulingPublished(schedulingSessionId: string) {
  const session = await prisma.examSchedulingSession.findUnique({
    where: { id: schedulingSessionId },
    include: {
      items: {
        include: {
          academicOffering: true,
        },
      },
    },
  })

  if (!session) {
    return { notified: 0 }
  }

  const notified = new Set<string>()
  for (const item of session.items) {
    const students = await prisma.studentProfile.findMany({
      where: {
        subjects: {
          some: {
            academicOfferingId: item.academicOfferingId,
          },
        },
      },
      select: {
        userId: true,
      },
    })

    for (const student of students) {
      if (notified.has(student.userId)) continue
      notified.add(student.userId)
      await createNotification({
        userId: student.userId,
        title: 'Exam timetable published',
        message: `Your ${session.name} examination schedule is now available.`,
        link: '/student/admit-cards',
      })
    }
  }

  return { notified: notified.size }
}

export async function notifyIncidentAcknowledged(incidentId: string, acknowledgedByUserId: string) {
  const existing = await prisma.examIncident.findUnique({
    where: { id: incidentId },
  })
  if (!existing) {
    throw new Error('Incident not found')
  }

  if (existing.status === Phase8IncidentStatus.ACKNOWLEDGED && existing.acknowledgedByUserId === acknowledgedByUserId) {
    return existing
  }

  const incident = await prisma.examIncident.update({
    where: { id: incidentId },
    data: {
      status: Phase8IncidentStatus.ACKNOWLEDGED,
      acknowledgedByUserId,
      acknowledgedAt: new Date(),
    },
  })

  await prisma.activityLog.create({
    data: {
      userId: acknowledgedByUserId,
      action: 'phase8.incident.acknowledged',
      details: JSON.stringify({
        incidentId: incident.id,
      }),
    },
  })

  await createNotification({
    userId: incident.reporterUserId,
    title: 'Exam incident acknowledged',
    message: `Incident "${incident.title}" has been acknowledged.`,
    link: '/teacher/invigilation',
  })

  return incident
}

export async function transitionIncidentStatus(input: {
  incidentId: string
  userId: string
  action: 'resolve' | 'escalate'
}) {
  const incident = await prisma.examIncident.findUnique({
    where: { id: input.incidentId },
  })
  if (!incident) {
    throw new Error('Incident not found')
  }

  const nextStatus =
    input.action === 'resolve' ? Phase8IncidentStatus.RESOLVED : Phase8IncidentStatus.ESCALATED

  if (incident.status === nextStatus) {
    return incident
  }

  const updated = await prisma.examIncident.update({
    where: { id: input.incidentId },
    data: {
      status: nextStatus,
      resolvedAt: input.action === 'resolve' ? new Date() : incident.resolvedAt,
    },
  })

  await prisma.activityLog.create({
    data: {
      userId: input.userId,
      action: `phase8.incident.${input.action}d`,
      details: JSON.stringify({
        incidentId: updated.id,
      }),
    },
  })

  return updated
}
