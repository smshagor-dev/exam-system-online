import {
  Phase8AttendanceMethod,
  Phase8AttendanceStatus,
  Phase8CalendarStatus,
  Phase8DutyRoleType,
  Phase8HolidayScopeType,
  Phase8IncidentStatus,
  Phase8IncidentType,
  Phase8InvigilatorRoleType,
  Phase8ScheduleLifecycleStatus,
  Phase8ScheduleSessionType,
} from '@prisma/client'
import { z } from 'zod'

const optionalCuid = () => z.string().cuid().optional().nullable()
const dateTimeStringSchema = z.string().trim().refine((value) => !Number.isNaN(new Date(value).getTime()), {
  message: 'Invalid date/time',
})
const normalizedCodeSchema = z.string().trim().min(2).max(30).transform((value) => value.toUpperCase())

export const examCampusSchema = z.object({
  departmentId: optionalCuid(),
  name: z.string().trim().min(2),
  code: normalizedCodeSchema,
  description: z.string().trim().optional().nullable(),
  isActive: z.boolean().default(true),
})

export const examBuildingSchema = z.object({
  campusId: z.string().cuid(),
  name: z.string().trim().min(2),
  code: normalizedCodeSchema,
  floors: z.number().int().min(1).max(50).default(1),
  isActive: z.boolean().default(true),
})

export const examRoomSchema = z.object({
  campusId: z.string().cuid(),
  buildingId: z.string().cuid(),
  name: z.string().trim().min(2),
  code: normalizedCodeSchema,
  floorNumber: z.number().int().min(1).max(200).default(1),
  capacity: z.number().int().min(1).max(5000),
  seatLayoutJson: z.any().optional().nullable(),
  equipmentJson: z.any().optional().nullable(),
  isAccessible: z.boolean().default(false),
  isComputerLab: z.boolean().default(false),
  isPracticalLab: z.boolean().default(false),
  hasProjector: z.boolean().default(false),
  hasInternet: z.boolean().default(false),
  isMaintenance: z.boolean().default(false),
  maintenanceNotes: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().default(true),
})

const examCalendarBaseSchema = z.object({
  academicSessionId: z.string().cuid(),
  departmentId: optionalCuid(),
  semesterId: optionalCuid(),
  campusId: optionalCuid(),
  name: z.string().trim().min(2),
  status: z.nativeEnum(Phase8CalendarStatus).default(Phase8CalendarStatus.DRAFT),
  teachingStartsAt: dateTimeStringSchema,
  teachingEndsAt: dateTimeStringSchema,
  registrationStartsAt: dateTimeStringSchema,
  registrationEndsAt: dateTimeStringSchema,
  courseworkStartsAt: dateTimeStringSchema,
  courseworkEndsAt: dateTimeStringSchema,
  examinationStartsAt: dateTimeStringSchema,
  examinationEndsAt: dateTimeStringSchema,
  makeupStartsAt: dateTimeStringSchema.optional().nullable(),
  makeupEndsAt: dateTimeStringSchema.optional().nullable(),
  publishedAt: dateTimeStringSchema.optional().nullable(),
})

export const examCalendarSchema = examCalendarBaseSchema.superRefine((data, ctx) => {
  const pairs: Array<[string, string, string]> = [
    ['teachingStartsAt', 'teachingEndsAt', 'Teaching'],
    ['registrationStartsAt', 'registrationEndsAt', 'Registration'],
    ['courseworkStartsAt', 'courseworkEndsAt', 'Coursework'],
    ['examinationStartsAt', 'examinationEndsAt', 'Examination'],
  ]

  for (const [startKey, endKey, label] of pairs) {
    const start = new Date(data[startKey as keyof typeof data] as string)
    const end = new Date(data[endKey as keyof typeof data] as string)
    if (start >= end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [endKey],
        message: `${label} end time must be after the start time`,
      })
    }
  }

  if (data.makeupStartsAt && data.makeupEndsAt && new Date(data.makeupStartsAt) >= new Date(data.makeupEndsAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['makeupEndsAt'],
      message: 'Makeup window end time must be after the start time',
    })
  }
})

export const updateExamCalendarSchema = examCalendarBaseSchema.partial()

export const examHolidaySchema = z.object({
  calendarId: z.string().cuid(),
  departmentId: optionalCuid(),
  campusId: optionalCuid(),
  scopeType: z.nativeEnum(Phase8HolidayScopeType).default(Phase8HolidayScopeType.GLOBAL),
  name: z.string().trim().min(2),
  startsAt: dateTimeStringSchema,
  endsAt: dateTimeStringSchema,
  isRecurringAnnual: z.boolean().default(false),
  emergencyClosure: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional().nullable(),
}).refine((data) => new Date(data.startsAt) < new Date(data.endsAt), {
  path: ['endsAt'],
  message: 'Holiday end time must be after the start time',
})

export const updateExamHolidaySchema = z.object({
  calendarId: z.string().cuid().optional(),
  departmentId: optionalCuid(),
  campusId: optionalCuid(),
  scopeType: z.nativeEnum(Phase8HolidayScopeType).optional(),
  name: z.string().trim().min(2).optional(),
  startsAt: dateTimeStringSchema.optional(),
  endsAt: dateTimeStringSchema.optional(),
  isRecurringAnnual: z.boolean().optional(),
  emergencyClosure: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
})

export const examSchedulingSessionSchema = z.object({
  academicSessionId: z.string().cuid(),
  departmentId: z.string().cuid(),
  programId: optionalCuid(),
  semesterId: optionalCuid(),
  campusId: optionalCuid(),
  name: z.string().trim().min(2),
  type: z.nativeEnum(Phase8ScheduleSessionType),
  status: z.nativeEnum(Phase8ScheduleLifecycleStatus).default(Phase8ScheduleLifecycleStatus.DRAFT),
  publishedAt: dateTimeStringSchema.optional().nullable(),
  lockedAt: dateTimeStringSchema.optional().nullable(),
})

export const examScheduleItemSchema = z.object({
  schedulingSessionId: z.string().cuid(),
  examId: optionalCuid(),
  academicOfferingId: z.string().cuid(),
  departmentId: z.string().cuid(),
  programId: z.string().cuid(),
  subjectId: z.string().cuid(),
  languageId: z.string().cuid(),
  groupId: z.string().cuid(),
  academicYearId: z.string().cuid(),
  semesterId: z.string().cuid(),
  campusId: optionalCuid(),
  roomId: optionalCuid(),
  status: z.nativeEnum(Phase8ScheduleLifecycleStatus).default(Phase8ScheduleLifecycleStatus.SCHEDULED),
  scheduledStart: dateTimeStringSchema,
  scheduledEnd: dateTimeStringSchema,
  durationMinutes: z.number().int().min(1).max(1440),
  studentCount: z.number().int().min(0).max(50000),
  manualOverride: z.boolean().default(false),
  conflictFlagsJson: z.any().optional().nullable(),
}).refine((data) => new Date(data.scheduledStart) < new Date(data.scheduledEnd), {
  path: ['scheduledEnd'],
  message: 'Scheduled end time must be after the start time',
})

export const examSchedulingGenerateSchema = z.object({
  schedulingSessionId: z.string().cuid(),
  academicOfferingIds: z.array(z.string().cuid()).min(1),
  roomIds: z.array(z.string().cuid()).min(1),
  startsAt: dateTimeStringSchema,
  slotMinutes: z.number().int().min(30).max(720).default(120),
  gapMinutes: z.number().int().min(0).max(180).default(30),
  campusId: optionalCuid(),
})

export const examDutyAssignmentSchema = z.object({
  teacherId: z.string().cuid(),
  departmentId: z.string().cuid(),
  campusId: optionalCuid(),
  roleType: z.nativeEnum(Phase8DutyRoleType),
  startsAt: dateTimeStringSchema.optional().nullable(),
  endsAt: dateTimeStringSchema.optional().nullable(),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(2000).optional().nullable(),
}).refine((data) => {
  if (!data.startsAt || !data.endsAt) return true
  return new Date(data.startsAt) < new Date(data.endsAt)
}, {
  path: ['endsAt'],
  message: 'Duty assignment end time must be after the start time',
})

export const examInvigilatorAssignmentSchema = z.object({
  scheduleItemId: z.string().cuid(),
  teacherId: z.string().cuid(),
  replacementTeacherId: optionalCuid(),
  roleType: z.nativeEnum(Phase8InvigilatorRoleType),
  startsAt: dateTimeStringSchema,
  endsAt: dateTimeStringSchema,
  notes: z.string().trim().max(2000).optional().nullable(),
}).refine((data) => new Date(data.startsAt) < new Date(data.endsAt), {
  path: ['endsAt'],
  message: 'Invigilation end time must be after the start time',
})

export const examSeatPlanSchema = z.object({
  scheduleItemId: z.string().cuid(),
  spacingPolicy: z.number().int().min(1).max(10).default(1),
  notes: z.string().trim().max(2000).optional().nullable(),
})

export const examAttendanceSchema = z.object({
  scheduleItemId: z.string().cuid(),
  studentId: z.string().cuid(),
  roomId: optionalCuid(),
  seatAssignmentId: optionalCuid(),
  markedByUserId: z.string().cuid(),
  status: z.nativeEnum(Phase8AttendanceStatus),
  method: z.nativeEnum(Phase8AttendanceMethod),
  markedAt: dateTimeStringSchema.optional(),
  arrivedAt: dateTimeStringSchema.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
})

export const examIncidentSchema = z.object({
  scheduleItemId: z.string().cuid(),
  roomId: optionalCuid(),
  reporterUserId: z.string().cuid(),
  acknowledgedByUserId: optionalCuid(),
  studentId: optionalCuid(),
  type: z.nativeEnum(Phase8IncidentType),
  status: z.nativeEnum(Phase8IncidentStatus).default(Phase8IncidentStatus.OPEN),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(5000),
  attachmentUrls: z.array(z.string().trim().url()).optional().nullable(),
  acknowledgedAt: dateTimeStringSchema.optional().nullable(),
  resolvedAt: dateTimeStringSchema.optional().nullable(),
})
