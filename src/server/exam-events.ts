/**
 * src/server/exam-events.ts
 * 
 * Centralized exam event bus for server-side coordination.
 * Decouples socket events from business logic.
 */

import { EventEmitter } from 'events'

type ExamEvent =
  | 'exam_started'
  | 'exam_paused'
  | 'exam_resumed'
  | 'exam_ended'
  | 'student_joined'
  | 'student_submitted'
  | 'student_auto_submitted'
  | 'result_published'
  | 'answer_saved'

interface ExamEventPayload {
  examId: string
  data?: Record<string, any>
}

class ExamEventBus extends EventEmitter {
  emit(event: ExamEvent, payload: ExamEventPayload): boolean {
    return super.emit(event, payload)
  }

  on(event: ExamEvent, listener: (payload: ExamEventPayload) => void): this {
    return super.on(event, listener)
  }

  off(event: ExamEvent, listener: (payload: ExamEventPayload) => void): this {
    return super.off(event, listener)
  }
}

// Singleton event bus
export const examEventBus = new ExamEventBus()
examEventBus.setMaxListeners(50) // Support many concurrent exams

// ─── Helper emit functions ────────────────────────────────────────────────────

export function emitExamStarted(examId: string) {
  examEventBus.emit('exam_started', { examId })
}

export function emitExamEnded(examId: string) {
  examEventBus.emit('exam_ended', { examId })
}

export function emitStudentJoined(examId: string, studentData: Record<string, any>) {
  examEventBus.emit('student_joined', { examId, data: studentData })
}

export function emitStudentSubmitted(examId: string, attemptId: string) {
  examEventBus.emit('student_submitted', { examId, data: { attemptId } })
}

export function emitResultPublished(examId: string, resultId: string, studentUserId: string) {
  examEventBus.emit('result_published', { examId, data: { resultId, studentUserId } })
}
