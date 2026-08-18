/**
 * Permission facade.
 *
 * The complete existing permission engine is preserved in permissions-core.ts.
 * This facade adds re-exam rules without changing the regular permission engine:
 * - an approved re-exam may only be opened/joined by its assigned student;
 * - legacy same-exam retakes are disabled so a submitted attempt is never reused.
 */

import {
  getStudentExamAccessContext as getCoreStudentExamAccessContext,
  type StudentExamAccessObserver,
} from './permissions-core'
import { getReExamTargetForExam } from './reexam-store'

export * from './permissions-core'

export async function getStudentExamAccessContext(
  studentUserId: string,
  examId: string,
  observer?: StudentExamAccessObserver
) {
  const reExamTarget = await getReExamTargetForExam(examId)

  if (reExamTarget && reExamTarget.studentUserId !== studentUserId) {
    return {
      allowed: false as const,
      reason: 'This re-exam is assigned to another student',
      profile: null,
      exam: null,
      existingAttempt: null,
    }
  }

  const context = await getCoreStudentExamAccessContext(studentUserId, examId, observer)

  // The old allowRetake path re-opened the same StudentExamAttempt. Re-exams now
  // use a separate cloned Exam, so Socket.IO must always treat a submitted
  // regular exam as non-retakable even if an old record still has allowRetake=true.
  if (!reExamTarget && context.exam?.allowRetake) {
    return {
      ...context,
      exam: {
        ...context.exam,
        allowRetake: false,
      },
    }
  }

  return context
}

export async function studentCanAccessExam(
  studentUserId: string,
  examId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const result = await getStudentExamAccessContext(studentUserId, examId)
  return result.reason
    ? { allowed: result.allowed, reason: result.reason }
    : { allowed: result.allowed }
}
