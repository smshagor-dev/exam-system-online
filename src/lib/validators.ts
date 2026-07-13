/**
 * src/lib/validators.ts
 * Zod schemas for all input validation.
 * Import and use in API route handlers and server actions.
 */

import { z } from 'zod'
import {
  QuestionType,
  ResultMode,
  ExamStatus,
  RegistrationFieldType,
  AiProvider,
  AcademicOfferingStatus,
  StudentEnrollmentStatus,
  StudentTransferType,
  StudentLeaveType,
  UserRole,
} from '@prisma/client/index'

const optionalCuid = () => z.string().cuid().optional().nullable()
const normalizedCodeSchema = z.string().trim().min(2).max(30).transform((value) => value.toUpperCase())
const dateTimeStringSchema = z.string().trim().refine((value) => !Number.isNaN(new Date(value).getTime()), {
  message: 'Invalid date/time',
})

// ─── Auth ──────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const registerStudentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  course: normalizedCodeSchema,
  departmentId: z.string().cuid('Invalid department'),
  subjectId: z.string().cuid('Invalid subject'),
  languageId: z.string().cuid('Invalid department language'),
  groupId: z.string().cuid('Invalid group'),
  academicYearId: z.string().cuid('Invalid academic year'),
  semesterId: z.string().cuid('Invalid semester'),
  phone: z.string().optional(),
  customFieldResponses: z.record(z.union([z.string(), z.boolean()])).optional(),
})

export const registerTeacherSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  departmentId: z.string().cuid(),
  subjectId: z.string().cuid(),
  languageId: z.string().cuid(),
  groupId: z.string().cuid(),
  academicYearId: z.string().cuid(),
  semesterId: z.string().cuid(),
  phone: z.string().optional(),
})

export const verifyAccountSchema = z.object({
  email: z.string().email('Invalid email'),
  code: z.string().length(6, 'Verification code must be 6 digits'),
})

export const sendVerificationCodeSchema = z.object({
  email: z.string().email('Invalid email'),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email'),
})

export const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email'),
  code: z.string().length(6, 'Reset code must be 6 digits'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const registrationFieldSchema = z.object({
  departmentId: z.string().cuid('Invalid department'),
  label: z.string().min(2, 'Label must be at least 2 characters'),
  type: z.nativeEnum(RegistrationFieldType),
  isRequired: z.boolean().default(false),
  isActive: z.boolean().default(true),
  placeholder: z.string().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  options: z.array(z.string().min(1)).optional(),
}).superRefine((data, ctx) => {
  if (data.type === RegistrationFieldType.SELECT && (!data.options || data.options.length < 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'Selection fields require at least one option',
    })
  }
})

// ─── Academic Structure ────────────────────────────────────────────────────

export const departmentSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(10).toUpperCase(),
  description: z.string().optional(),
})

export const subjectSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(15).toUpperCase(),
  departmentId: z.string().cuid(),
  languageId: optionalCuid(),
  description: z.string().optional(),
})

export const languageSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(5).toUpperCase(),
})

export const systemLanguageSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(5).toUpperCase(),
  isDefault: z.boolean().optional().default(false),
})

export const systemSettingsSchema = z.object({
  systemName: z.string().trim().min(2, 'System name is required'),
  systemShortName: z.string().trim().min(2, 'Short name is required').max(12, 'Short name is too long'),
  systemDescription: z.string().trim().optional().nullable(),
  systemLogoUrl: z.string().trim().url('Logo URL must be valid').optional().or(z.literal('')).nullable(),
  systemIconUrl: z.string().trim().url('Icon URL must be valid').optional().or(z.literal('')).nullable(),
  footerText: z.string().trim().optional().nullable(),
  supportEmail: z.string().trim().email('Support email must be valid').optional().or(z.literal('')).nullable(),
  smtpHost: z.string().trim().optional().nullable(),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpSecure: z.boolean().default(false),
  smtpUser: z.string().trim().optional().nullable(),
  smtpPass: z.string().optional().nullable(),
  mailFrom: z.string().trim().optional().nullable(),
  requireEmailVerification: z.boolean().default(true),
}).superRefine((data, ctx) => {
  const hasAnySmtpField = Boolean(
    data.smtpHost?.trim() ||
    data.smtpPort ||
    data.smtpUser?.trim() ||
    data.smtpPass ||
    data.mailFrom?.trim()
  )

  if (hasAnySmtpField) {
    if (!data.smtpHost?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['smtpHost'], message: 'SMTP host is required' })
    }
    if (!data.smtpPort) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['smtpPort'], message: 'SMTP port is required' })
    }
    if (!data.mailFrom?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mailFrom'], message: 'From email is required' })
    }
  }
})

export const smtpTestSchema = z.object({
  to: z.string().email('A valid recipient email is required'),
})

export const aiSettingsSchema = z.object({
  aiEnabled: z.boolean().default(false),
  aiProvider: z.nativeEnum(AiProvider).nullable().optional(),
  aiOpenAiApiKey: z.string().optional().nullable(),
  aiOpenAiModel: z.string().trim().optional().nullable(),
  aiGeminiApiKey: z.string().optional().nullable(),
  aiGeminiModel: z.string().trim().optional().nullable(),
  aiClaudeApiKey: z.string().optional().nullable(),
  aiClaudeModel: z.string().trim().optional().nullable(),
  aiTemperature: z.number().min(0).max(2).default(0.2),
}).superRefine((data, ctx) => {
  if (!data.aiEnabled) return

  if (!data.aiProvider) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['aiProvider'], message: 'Choose an AI provider' })
    return
  }

  if (data.aiProvider === AiProvider.OPENAI) {
    if (!data.aiOpenAiApiKey?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['aiOpenAiApiKey'], message: 'OpenAI API key is required' })
    }
    if (!data.aiOpenAiModel?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['aiOpenAiModel'], message: 'OpenAI model is required' })
    }
  }

  if (data.aiProvider === AiProvider.GEMINI) {
    if (!data.aiGeminiApiKey?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['aiGeminiApiKey'], message: 'Gemini API key is required' })
    }
    if (!data.aiGeminiModel?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['aiGeminiModel'], message: 'Gemini model is required' })
    }
  }

  if (data.aiProvider === AiProvider.CLAUDE) {
    if (!data.aiClaudeApiKey?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['aiClaudeApiKey'], message: 'Claude API key is required' })
    }
    if (!data.aiClaudeModel?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['aiClaudeModel'], message: 'Claude model is required' })
    }
  }
})

export const groupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  code: z.string().trim().min(2, 'Code is required').max(20, 'Code is too long').transform((value) => value.toUpperCase()),
  academicYearId: z.string().cuid('Academic year is required'),
  departmentId: z.string().cuid('Department is required'),
  programId: z.string().cuid('Program is required'),
  languageId: z.string().cuid('Language is required'),
  departmentLanguageId: optionalCuid(),
  academicSessionId: z.string().cuid('Academic session is required'),
  programYearId: z.string().cuid('Program year is required'),
  currentProgramSemesterId: optionalCuid(),
  isActive: z.boolean().default(true),
})

export const academicYearSchema = z.object({
  name: z.string().min(1),
  year: z.number().int().min(1).max(10),
})

export const semesterSchema = z.object({
  name: z.string().min(1),
  number: z.number().int().min(1).max(20),
})

export const degreeLevelSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  code: normalizedCodeSchema,
  description: z.string().trim().optional().nullable(),
  defaultYears: z.number().int().positive().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

export const academicProgramSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  code: normalizedCodeSchema,
  degreeLevelId: z.string().cuid('Degree level is required'),
  departmentId: z.string().cuid('Department is required'),
  durationYears: z.number().int().positive('Duration must be positive'),
  totalSemesters: z.number().int().positive('Total semesters must be positive'),
  description: z.string().trim().optional().nullable(),
  isActive: z.boolean().default(true),
})

export const departmentLanguageSchema = z.object({
  departmentId: z.string().cuid('Department is required'),
  languageId: z.string().cuid('Language is required'),
  isActive: z.boolean().default(true),
})

const academicSessionSchemaBase = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  code: normalizedCodeSchema,
  startDate: dateTimeStringSchema,
  endDate: dateTimeStringSchema,
  admissionStartDate: dateTimeStringSchema.optional().nullable(),
  admissionEndDate: dateTimeStringSchema.optional().nullable(),
  isCurrent: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

export const academicSessionSchema = academicSessionSchemaBase.refine((data) => new Date(data.startDate) < new Date(data.endDate), {
  path: ['endDate'],
  message: 'End date must be after start date',
}).refine((data) => {
  if (!data.admissionStartDate || !data.admissionEndDate) return true
  return new Date(data.admissionStartDate) < new Date(data.admissionEndDate)
}, {
  path: ['admissionEndDate'],
  message: 'Admission end date must be after admission start date',
})

export const updateAcademicSessionSchema = academicSessionSchemaBase.partial()

export const programYearSchema = z.object({
  programId: z.string().cuid('Program is required'),
  yearNumber: z.number().int().positive('Year number must be positive'),
  name: z.string().trim().min(2, 'Name is required'),
  code: normalizedCodeSchema,
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

export const programSemesterSchema = z.object({
  programId: z.string().cuid('Program is required'),
  programYearId: z.string().cuid('Program year is required'),
  semesterId: z.string().cuid('Semester is required'),
  semesterNumber: z.number().int().positive('Semester number must be positive'),
  isActive: z.boolean().default(true),
})

export const programSubjectSchema = z.object({
  programId: z.string().cuid('Program is required'),
  programYearId: z.string().cuid('Program year is required'),
  semesterId: z.string().cuid('Semester is required'),
  programSemesterId: optionalCuid(),
  subjectId: z.string().cuid('Subject is required'),
  creditHours: z.number().positive().optional().nullable(),
  theoryHours: z.number().positive().optional().nullable(),
  practicalHours: z.number().positive().optional().nullable(),
  isElective: z.boolean().default(false),
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

const academicOfferingSchemaBase = z.object({
  academicSessionId: z.string().cuid('Academic session is required'),
  programId: z.string().cuid('Program is required'),
  departmentId: z.string().cuid('Department is required'),
  departmentLanguageId: optionalCuid(),
  languageId: z.string().cuid('Language is required'),
  programYearId: z.string().cuid('Program year is required'),
  semesterId: z.string().cuid('Semester is required'),
  programSemesterId: optionalCuid(),
  groupId: z.string().cuid('Group is required'),
  subjectId: z.string().cuid('Subject is required'),
  programSubjectId: optionalCuid(),
  status: z.nativeEnum(AcademicOfferingStatus).default(AcademicOfferingStatus.PLANNED),
  startsAt: dateTimeStringSchema.optional().nullable(),
  endsAt: dateTimeStringSchema.optional().nullable(),
  isActive: z.boolean().default(true),
})

export const academicOfferingSchema = academicOfferingSchemaBase.refine((data) => {
  if (!data.startsAt || !data.endsAt) return true
  return new Date(data.endsAt) > new Date(data.startsAt)
}, {
  path: ['endsAt'],
  message: 'Offering end time must be after start time',
})

export const updateAcademicOfferingSchema = academicOfferingSchemaBase.partial()

// Student lifecycle

const studentLifecycleContextSchema = z.object({
  departmentId: z.string().cuid('Department is required'),
  academicSessionId: z.string().cuid('Academic session is required'),
  programId: z.string().cuid('Program is required'),
  programYearId: z.string().cuid('Program year is required'),
  semesterId: z.string().cuid('Semester is required'),
  programSemesterId: optionalCuid(),
  groupId: z.string().cuid('Group is required'),
  academicYearId: optionalCuid(),
  departmentLanguageId: optionalCuid(),
  languageId: optionalCuid(),
})

export const studentEnrollmentCreateSchema = studentLifecycleContextSchema.extend({
  studentId: z.string().cuid('Student is required'),
  status: z.nativeEnum(StudentEnrollmentStatus).default(StudentEnrollmentStatus.ACTIVE),
  enrolledAt: dateTimeStringSchema.optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export const studentEnrollmentUpdateSchema = studentLifecycleContextSchema.partial().extend({
  status: z.nativeEnum(StudentEnrollmentStatus).optional(),
  enrolledAt: dateTimeStringSchema.optional(),
  endedAt: dateTimeStringSchema.optional().nullable(),
  graduationDate: dateTimeStringSchema.optional().nullable(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export const studentPromotionSchema = studentLifecycleContextSchema.extend({
  studentId: z.string().cuid('Student is required'),
  manualOverride: z.boolean().default(false),
  overrideReason: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.manualOverride && !data.overrideReason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['overrideReason'],
      message: 'Override reason is required when manual override is enabled',
    })
  }
})

export const studentTransferSchema = studentLifecycleContextSchema.extend({
  studentId: z.string().cuid('Student is required'),
  transferType: z.nativeEnum(StudentTransferType),
  effectiveDate: dateTimeStringSchema.optional(),
  reason: z.string().trim().max(1000).optional().nullable(),
  approvalNote: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export const studentLeaveSchema = z.object({
  studentId: z.string().cuid('Student is required'),
  leaveType: z.nativeEnum(StudentLeaveType),
  startsAt: dateTimeStringSchema,
  endsAt: dateTimeStringSchema.optional().nullable(),
  status: z.string().trim().min(2).default('APPROVED'),
  reason: z.string().trim().min(2, 'Reason is required').max(1000),
  supportingNote: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
}).refine((data) => {
  if (!data.endsAt) return true
  return new Date(data.endsAt) >= new Date(data.startsAt)
}, {
  path: ['endsAt'],
  message: 'Leave end date must be after the start date',
})

export const studentReadmissionSchema = studentLifecycleContextSchema.extend({
  studentId: z.string().cuid('Student is required'),
  readmittedAt: dateTimeStringSchema.optional(),
  approvalReason: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export const studentGraduationSchema = z.object({
  studentId: z.string().cuid('Student is required'),
  graduatedAt: dateTimeStringSchema,
  finalCgpa: z.number().min(0).max(4).optional().nullable(),
  degreeClassification: z.string().trim().max(100).optional().nullable(),
  certificateNumber: z.string().trim().min(3).max(100).optional().nullable(),
  degreeAwarded: z.string().trim().min(2, 'Degree awarded is required'),
  alumniAt: dateTimeStringSchema.optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export const studentAlumniSchema = z.object({
  studentId: z.string().cuid('Student is required'),
  alumniAt: dateTimeStringSchema.optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
})

export const lifecycleAuditActorSchema = z.object({
  actorUserId: z.string().cuid(),
  actorRole: z.nativeEnum(UserRole),
  sourceApi: z.string().trim().min(1),
})

// ─── Questions ─────────────────────────────────────────────────────────────

export const questionOptionSchema = z.object({
  text: z.string().min(1, 'Option text is required'),
  isCorrect: z.boolean().default(false),
  orderIndex: z.number().int().default(0),
  imageUrl: z.string().url().optional().nullable(),
})

export const questionOptionTranslationSchema = z.object({
  languageId: z.string().cuid(),
  orderIndex: z.number().int().min(0),
  text: z.string().min(1, 'Translated option text is required'),
})

export const questionTranslationSchema = z.object({
  languageId: z.string().cuid(),
  text: z.string().min(5, 'Question text must be at least 5 characters'),
  expectedAnswer: z.string().optional().nullable(),
  explanation: z.string().optional().nullable(),
  keywords: z.array(z.string()).optional(),
  options: z.array(questionOptionTranslationSchema).optional(),
})

export const createQuestionSchema = z.object({
  subjectId: z.string().cuid(),
  languageId: z.string().cuid(),
  groupId: z.string().cuid(),
  academicYearId: z.string().cuid(),
  semesterId: z.string().cuid(),
  academicOfferingId: optionalCuid(),
  type: z.nativeEnum(QuestionType),
  text: z.string().min(5, 'Question text must be at least 5 characters'),
  marks: z.number().int().min(1).max(100),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  expectedAnswer: z.string().optional().nullable(),
  keywords: z.array(z.string()).optional(),
  explanation: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  options: z.array(questionOptionSchema).optional(),
  translations: z.array(questionTranslationSchema).optional(),
}).refine((data) => {
  // MCQ must have options
  if (data.type === QuestionType.MCQ) {
    return data.options && data.options.length >= 2
  }
  // T/F must have exactly 2 options
  if (data.type === QuestionType.TRUE_FALSE) {
    return data.options && data.options.length === 2
  }
  return true
}, { message: 'MCQ requires at least 2 options; True/False requires exactly 2' })

// ─── Exams ─────────────────────────────────────────────────────────────────

export const createExamSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional(),
  departmentId: z.string().cuid(),
  subjectId: z.string().cuid(),
  languageId: z.string().cuid(),
  groupId: z.string().cuid(),
  academicYearId: z.string().cuid(),
  semesterId: z.string().cuid(),
  academicOfferingId: optionalCuid(),
  questionType: z.nativeEnum(QuestionType).default(QuestionType.MIXED),
  resultMode: z.nativeEnum(ResultMode).default(ResultMode.AUTO),
  totalMarks: z.number().int().min(1),
  passingMarks: z.number().int().min(0),
  duration: z.number().int().min(1).max(480), // max 8 hours
  startTime: dateTimeStringSchema,
  endTime: dateTimeStringSchema,
  autoPublish: z.boolean().default(false),
  allowRetake: z.boolean().default(false),
  showAnswers: z.boolean().default(false),
  showMarks: z.boolean().default(true),
  instructions: z.string().optional(),
  translations: z.array(z.object({
    languageId: z.string().cuid(),
    title: z.string().min(3, 'Translated title must be at least 3 characters'),
    description: z.string().optional().nullable(),
    instructions: z.string().optional().nullable(),
  })).optional(),
  questionIds: z.array(z.object({
    questionId: z.string().cuid(),
    orderIndex: z.number().int().min(0),
    marks: z.number().int().min(1),
  })).min(1, 'Exam must have at least 1 question'),
}).refine(
  (data) => data.passingMarks <= data.totalMarks,
  { message: 'Passing marks cannot exceed total marks', path: ['passingMarks'] }
).refine(
  (data) => new Date(data.endTime) > new Date(data.startTime),
  { message: 'End time must be after start time', path: ['endTime'] }
)

export const updateExamStatusSchema = z.object({
  status: z.nativeEnum(ExamStatus),
})

// ─── Results ───────────────────────────────────────────────────────────────

export const reviewAnswerSchema = z.object({
  teacherMarks: z.number().min(0),
  teacherFeedback: z.string().optional(),
})

// ─── Pagination ─────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
