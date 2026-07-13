import { z } from 'zod'
import {
  Phase9AppealStatus,
  Phase9CertificateType,
  Phase9GradeComponentType,
  Phase9GraduationWorkflowStatus,
  Phase9MarksheetType,
  Phase9OfficerRoleType,
  Phase9ResultLifecycleStatus,
} from '@prisma/client'

const cuidSchema = z.string().cuid()
const dateTimeStringSchema = z.string().datetime({ offset: true })

export const phase9GradebookCreateSchema = z.object({
  academicOfferingId: cuidSchema,
  departmentId: cuidSchema,
  academicSessionId: cuidSchema,
  programId: cuidSchema,
  semesterId: cuidSchema,
  groupId: cuidSchema,
  gradingScaleId: cuidSchema.optional(),
  teacherId: cuidSchema.optional().nullable(),
  title: z.string().min(3).max(200),
  components: z.array(
    z.object({
      type: z.nativeEnum(Phase9GradeComponentType),
      name: z.string().min(2).max(100),
      weight: z.number().positive().max(100),
      maxMarks: z.number().positive().max(1000),
      passingMarks: z.number().min(0).max(1000).optional().nullable(),
      isRequired: z.boolean().optional(),
      sortOrder: z.number().int().min(0).optional(),
    })
  ).min(1),
})

export const phase9GradeEntryBatchSchema = z.object({
  entries: z.array(
    z.object({
      componentId: cuidSchema,
      studentId: cuidSchema,
      rawMarks: z.number().min(0).max(1000),
      moderatedMarks: z.number().min(0).max(1000).optional().nullable(),
      finalMarks: z.number().min(0).max(1000).optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
    })
  ).min(1),
})

export const phase9ResultTransitionSchema = z.object({
  status: z.nativeEnum(Phase9ResultLifecycleStatus),
  notes: z.string().max(2000).optional().nullable(),
})

export const phase9GradingScaleSchema = z.object({
  departmentId: cuidSchema,
  name: z.string().min(2).max(100),
  code: z.string().min(2).max(30),
  isDefault: z.boolean().optional(),
  maximumGpa: z.number().min(1).max(10).optional(),
  passPercentage: z.number().min(0).max(100).optional(),
  bands: z.array(
    z.object({
      label: z.string().min(1).max(20),
      minPercentage: z.number().min(0).max(100),
      maxPercentage: z.number().min(0).max(100),
      gradePoint: z.number().min(0).max(10),
      isPassing: z.boolean().optional(),
      sortOrder: z.number().int().min(0).optional(),
    })
  ).min(1),
})

export const phase9ResultPolicySchema = z.object({
  departmentId: cuidSchema,
  gradingScaleId: cuidSchema,
  passingPercentage: z.number().min(0).max(100).optional(),
  goodStandingMinCgpa: z.number().min(0).max(10).optional(),
  warningMinCgpa: z.number().min(0).max(10).optional(),
  probationMinCgpa: z.number().min(0).max(10).optional(),
  suspendedMaxFailures: z.number().int().min(0).max(50).optional(),
  dismissedMaxFailures: z.number().int().min(0).max(100).optional(),
  graduationMinCgpa: z.number().min(0).max(10).optional(),
  graduationMinimumCredits: z.number().min(0).max(1000).optional(),
  allowRepeatCourseReplacement: z.boolean().optional(),
  allowImprovementReplacement: z.boolean().optional(),
})

export const phase9OfficerAssignmentSchema = z.object({
  teacherId: cuidSchema,
  departmentId: cuidSchema,
  roleType: z.nativeEnum(Phase9OfficerRoleType),
  startsAt: dateTimeStringSchema.optional().nullable(),
  endsAt: dateTimeStringSchema.optional().nullable(),
  isActive: z.boolean().optional(),
})

export const phase9DocumentRequestSchema = z.object({
  locale: z.string().min(2).max(12).optional(),
  notes: z.string().max(2000).optional().nullable(),
})

export const phase9CertificateRequestSchema = phase9DocumentRequestSchema.extend({
  type: z.nativeEnum(Phase9CertificateType),
  graduationId: cuidSchema.optional().nullable(),
  reissuedFromId: cuidSchema.optional().nullable(),
})

export const phase9AppealCreateSchema = z.object({
  resultRecordId: cuidSchema,
  teacherId: cuidSchema.optional().nullable(),
  reason: z.string().min(5).max(4000),
})

export const phase9AppealUpdateSchema = z.object({
  status: z.nativeEnum(Phase9AppealStatus),
  teacherResponse: z.string().max(4000).optional().nullable(),
  adminDecision: z.string().max(4000).optional().nullable(),
})

export const phase9GraduationTransitionSchema = z.object({
  status: z.nativeEnum(Phase9GraduationWorkflowStatus),
  notes: z.string().max(2000).optional().nullable(),
})

export const phase9MarksheetRequestSchema = phase9DocumentRequestSchema.extend({
  type: z.nativeEnum(Phase9MarksheetType),
})
