import { z } from 'zod'
import {
  Phase10DiscussionThreadStatus,
  Phase10LessonType,
  Phase10LiveClassProvider,
  Phase10LiveAttendanceStatus,
  Phase10MaterialType,
  Phase10VideoSourceType,
} from '@prisma/client'

const cuidSchema = z.string().cuid()
const dateTimeStringSchema = z.string().datetime({ offset: true })

export const phase10CourseCreateSchema = z.object({
  departmentId: cuidSchema,
  programId: cuidSchema.optional().nullable(),
  academicOfferingId: cuidSchema.optional().nullable(),
  subjectId: cuidSchema,
  semesterId: cuidSchema,
  groupId: cuidSchema.optional().nullable(),
  languageId: cuidSchema,
  code: z.string().min(2).max(40),
  title: z.string().min(2).max(200),
  summary: z.string().max(4000).optional().nullable(),
  credits: z.number().min(0).max(100).optional().nullable(),
  outcomes: z
    .array(
      z.object({
        title: z.string().min(2).max(300),
        description: z.string().max(4000).optional().nullable(),
        sortOrder: z.number().int().min(0).optional(),
      })
    )
    .optional(),
  prerequisites: z
    .array(
      z.object({
        prerequisiteSubjectId: cuidSchema.optional().nullable(),
        title: z.string().max(300).optional().nullable(),
        minimumGrade: z.string().max(50).optional().nullable(),
        notes: z.string().max(1000).optional().nullable(),
        sortOrder: z.number().int().min(0).optional(),
      })
    )
    .optional(),
  translations: z
    .array(
      z.object({
        languageId: cuidSchema,
        title: z.string().min(2).max(200),
        summary: z.string().max(4000).optional().nullable(),
      })
    )
    .optional(),
  version: z.object({
    title: z.string().min(2).max(200),
    syllabus: z.string().max(12000).optional().nullable(),
    changeLog: z.string().max(4000).optional().nullable(),
    sections: z.array(
      z.object({
        title: z.string().min(2).max(200),
        summary: z.string().max(4000).optional().nullable(),
        sortOrder: z.number().int().min(0).optional(),
        lessons: z.array(
          z.object({
            title: z.string().min(2).max(200),
            summary: z.string().max(4000).optional().nullable(),
            type: z.nativeEnum(Phase10LessonType),
            estimatedMinutes: z.number().int().min(0).max(10000).optional().nullable(),
            richText: z.string().max(20000).optional().nullable(),
            sortOrder: z.number().int().min(0).optional(),
            translations: z
              .array(
                z.object({
                  languageId: cuidSchema,
                  title: z.string().min(2).max(200),
                  summary: z.string().max(4000).optional().nullable(),
                  richText: z.string().max(20000).optional().nullable(),
                })
              )
              .optional(),
          })
        ),
      })
    ),
  }),
})

export const phase10CourseUpdateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  summary: z.string().max(4000).optional().nullable(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
})

export const phase10MaterialCreateSchema = z.object({
  type: z.nativeEnum(Phase10MaterialType),
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional().nullable(),
  externalUrl: z.string().url().optional().nullable(),
  richText: z.string().max(20000).optional().nullable(),
  scormManifestUrl: z.string().url().optional().nullable(),
  scormLaunchUrl: z.string().url().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  translations: z
    .array(
      z.object({
        languageId: cuidSchema,
        title: z.string().min(2).max(200),
        description: z.string().max(4000).optional().nullable(),
        richText: z.string().max(20000).optional().nullable(),
      })
    )
    .optional(),
})

export const phase10VideoCreateSchema = z.object({
  title: z.string().min(2).max(200),
  sourceType: z.nativeEnum(Phase10VideoSourceType),
  externalUrl: z.string().url().optional().nullable(),
  streamingUrl: z.string().url().optional().nullable(),
  durationSeconds: z.number().int().min(0).max(100000).optional(),
  thumbnailUrl: z.string().url().optional().nullable(),
})

export const phase10VideoProgressSchema = z.object({
  lastPositionSeconds: z.number().int().min(0).max(100000),
  watchedSecondsDelta: z.number().int().min(0).max(100000).default(0),
  durationSeconds: z.number().int().min(0).max(100000).optional().nullable(),
})

export const phase10LessonPublishSchema = z.object({
  publish: z.boolean().default(true),
})

export const phase10LiveClassCreateSchema = z.object({
  provider: z.nativeEnum(Phase10LiveClassProvider),
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional().nullable(),
  startAt: dateTimeStringSchema,
  endAt: dateTimeStringSchema,
  joinUrl: z.string().url(),
  hostUrl: z.string().url().optional().nullable(),
  meetingCode: z.string().max(100).optional().nullable(),
  passcode: z.string().max(100).optional().nullable(),
  recordingUrl: z.string().url().optional().nullable(),
  calendarSyncToken: z.string().max(200).optional().nullable(),
})

export const phase10LessonProgressSchema = z.object({
  completionPercent: z.number().min(0).max(100).optional(),
  readingProgressPercent: z.number().min(0).max(100).optional(),
  watchProgressPercent: z.number().min(0).max(100).optional(),
  assignmentCompleted: z.boolean().optional(),
  attendanceCompleted: z.boolean().optional(),
  quizCompleted: z.boolean().optional(),
  isCompleted: z.boolean().optional(),
})

export const phase10DiscussionThreadCreateSchema = z.object({
  courseId: cuidSchema,
  lessonId: cuidSchema,
  title: z.string().min(2).max(200),
  body: z.string().min(2).max(10000),
})

export const phase10DiscussionReplyCreateSchema = z.object({
  body: z.string().min(1).max(10000),
})

export const phase10DiscussionModerationSchema = z.object({
  status: z.nativeEnum(Phase10DiscussionThreadStatus).optional(),
  isPinned: z.boolean().optional(),
})

export const phase10LiveJoinSchema = z.object({
  status: z.nativeEnum(Phase10LiveAttendanceStatus).default(Phase10LiveAttendanceStatus.ATTENDED),
  joinedAt: dateTimeStringSchema.optional(),
  leftAt: dateTimeStringSchema.optional(),
})
