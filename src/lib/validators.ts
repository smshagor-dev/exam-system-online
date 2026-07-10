/**
 * src/lib/validators.ts
 * Zod schemas for all input validation.
 * Import and use in API route handlers and server actions.
 */

import { z } from 'zod'
import { QuestionType, ResultMode, ExamStatus, RegistrationFieldType, AiProvider } from '@prisma/client'

// ─── Auth ──────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const registerStudentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  course: z.enum(['BACHELOR_OF_SCIENCE', 'MASTER_OF_SCIENCE'], {
    message: 'Invalid course',
  }),
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
  languageId: z.string().cuid('Invalid department language'),
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
  name: z.string().min(1),
  code: z.string().min(2).max(15).toUpperCase(),
  academicYearId: z.string().cuid('Invalid academic year'),
})

export const academicYearSchema = z.object({
  name: z.string().min(1),
  year: z.number().int().min(1).max(10),
})

export const semesterSchema = z.object({
  name: z.string().min(1),
  number: z.number().int().min(1).max(20),
})

// ─── Questions ─────────────────────────────────────────────────────────────

export const questionOptionSchema = z.object({
  text: z.string().min(1, 'Option text is required'),
  isCorrect: z.boolean().default(false),
  orderIndex: z.number().int().default(0),
  imageUrl: z.string().url().optional().nullable(),
})

export const createQuestionSchema = z.object({
  subjectId: z.string().cuid(),
  languageId: z.string().cuid(),
  groupId: z.string().cuid(),
  academicYearId: z.string().cuid(),
  semesterId: z.string().cuid(),
  type: z.nativeEnum(QuestionType),
  text: z.string().min(5, 'Question text must be at least 5 characters'),
  marks: z.number().int().min(1).max(100),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  expectedAnswer: z.string().optional().nullable(),
  keywords: z.array(z.string()).optional(),
  explanation: z.string().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  options: z.array(questionOptionSchema).optional(),
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
  questionType: z.nativeEnum(QuestionType).default(QuestionType.MIXED),
  resultMode: z.nativeEnum(ResultMode).default(ResultMode.AUTO),
  totalMarks: z.number().int().min(1),
  passingMarks: z.number().int().min(0),
  duration: z.number().int().min(1).max(480), // max 8 hours
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  autoPublish: z.boolean().default(false),
  allowRetake: z.boolean().default(false),
  showAnswers: z.boolean().default(false),
  showMarks: z.boolean().default(true),
  instructions: z.string().optional(),
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
