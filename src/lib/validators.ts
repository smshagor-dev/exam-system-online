/**
 * src/lib/validators.ts
 * Zod schemas for all input validation.
 * Import and use in API route handlers and server actions.
 */

import { z } from 'zod'
import { QuestionType, ResultMode, ExamStatus } from '@prisma/client'

// ─── Auth ──────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const registerStudentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  departmentId: z.string().cuid('Invalid department'),
  subjectId: z.string().cuid('Invalid subject'),
  languageId: z.string().cuid('Invalid language'),
  groupId: z.string().cuid('Invalid group'),
  academicYearId: z.string().cuid('Invalid academic year'),
  semesterId: z.string().cuid('Invalid semester'),
  rollNumber: z.string().optional(),
  phone: z.string().optional(),
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
  description: z.string().optional(),
})

export const languageSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(5).toUpperCase(),
})

export const groupSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(2).max(15).toUpperCase(),
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
