/**
 * src/types/exam.ts
 * Exam-related TypeScript types used across client and server.
 */

import { ExamStatus, QuestionType, ResultMode, AttemptStatus } from '@prisma/client'

export interface ExamSummary {
  id: string
  title: string
  description: string | null
  status: ExamStatus
  questionType: QuestionType
  resultMode: ResultMode
  totalMarks: number
  passingMarks: number
  duration: number
  startTime: Date
  endTime: Date
  autoPublish: boolean
  allowRetake: boolean
  showAnswers: boolean
  showMarks: boolean
}

export interface ExamQuestion {
  id: string                  // ExamQuestion.id
  questionId: string
  orderIndex: number
  marks: number
  type: QuestionType
  text: string
  imageUrl: string | null
  options: QuestionOption[]
}

export interface QuestionOption {
  id: string
  text: string
  orderIndex: number
  // isCorrect is omitted for students
}

export interface StudentAttempt {
  id: string
  examId: string
  studentId: string
  status: AttemptStatus
  startedAt: Date | null
  submittedAt: Date | null
  tabSwitchCount: number
  reconnectCount: number
}

export interface SaveAnswerPayload {
  attemptId: string
  questionId: string
  selectedOption?: string
  answerText?: string
}

export interface ExamTimerState {
  examId: string
  remainingSeconds: number
  elapsedSeconds: number
  isPaused: boolean
}

// Grade thresholds
export const GRADE_BOUNDARIES = [
  { min: 90, grade: 'A+' },
  { min: 80, grade: 'A' },
  { min: 70, grade: 'B+' },
  { min: 60, grade: 'B' },
  { min: 50, grade: 'C' },
  { min: 40, grade: 'D' },
  { min: 0, grade: 'F' },
] as const
