/**
 * src/types/result.ts
 * Result-related types.
 */

import { ResultStatus, AnswerCheckStatus } from '@prisma/client'

export interface ExamResultSummary {
  id: string
  examId: string
  attemptId: string
  studentId: string
  totalMarks: number
  marksObtained: number
  percentage: number
  grade: string
  isPassed: boolean
  status: ResultStatus
  publishedAt: Date | null
}

export interface AnswerReview {
  id: string
  questionId: string
  questionText: string
  questionType: string
  maxMarks: number
  studentAnswer: string | null
  selectedOption: string | null
  expectedAnswer: string | null
  checkStatus: AnswerCheckStatus
  isCorrect: boolean | null
  marksAwarded: number | null
  teacherMarks: number | null
  teacherFeedback: string | null
  aiSuggestedMarks: number | null
  aiSuggestedFeedback: string | null
}

export interface PublishResultPayload {
  resultId: string
  examId: string
  studentId: string
}
