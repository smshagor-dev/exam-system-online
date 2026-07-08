/**
 * src/types/socket.ts
 * Socket event type definitions for type-safe client/server communication.
 */

// ─── Server -> Client events ─────────────────────────────────────────────────
export interface ServerToClientEvents {
  // Exam lifecycle
  'exam:started': (data: { examId: string; startedAt: number; durationMs: number }) => void
  'exam:paused': (data: { examId: string; remainingSeconds: number }) => void
  'exam:ended': (data: { examId: string }) => void
  'exam:joined': (data: { examId: string; attemptId?: string; message: string }) => void
  'exam:attempt_started': (data: { attemptId: string }) => void

  // Timer
  'exam:timer_update': (data: { examId: string; remaining: number; elapsed: number }) => void

  // Answers
  'exam:answer_saved': (data: { questionId?: string; answerId?: string; saved: boolean }) => void

  // Submission
  'exam:submitted': (data: { attemptId: string; success: boolean }) => void
  'exam:auto_submitted': (data: { examId: string; attemptId: string }) => void

  // Teacher monitoring
  'exam:student_joined': (data: {
    examId: string
    studentId: string
    userId: string
    socketId: string
    studentName: string
    reconnected: boolean
  }) => void
  'exam:student_offline': (data: { examId: string; userId: string; socketId: string }) => void
  'exam:suspicious_activity': (data: {
    studentId: string
    type: 'TAB_SWITCH' | 'RECONNECT' | 'DISCONNECT'
    count: number
  }) => void

  // Results
  'result:published': (data: { examId: string; attemptId: string }) => void

  // Notifications
  'notification:new': (data: { message: string; link?: string }) => void

  // Errors
  error: (data: { message: string }) => void
}

// ─── Client -> Server events ─────────────────────────────────────────────────
export interface ClientToServerEvents {
  // Teacher
  'teacher:create_exam': (data: { examId: string }) => void
  'teacher:start_exam': (data: { examId: string }) => void
  'teacher:pause_exam': (data: { examId: string }) => void
  'teacher:end_exam': (data: { examId: string }) => void
  'teacher:publish_result': (data: { examId: string; attemptId: string }) => void
  'teacher:review_answer': (data: {
    answerId: string
    marks: number
    feedback: string
  }) => void

  // Student
  'student:join_exam': (data: { examId: string }) => void
  'student:start_attempt': (data: { examId: string }) => void
  'student:save_answer': (data: {
    attemptId: string
    questionId: string
    selectedOption?: string
    answerText?: string
  }) => void
  'student:submit_exam': (data: { attemptId: string }) => void
  'student:auto_submit': (data: { attemptId: string }) => void
  'student:disconnect_exam': (data: { examId: string }) => void
  'student:tab_switch': (data: { attemptId: string }) => void
}
