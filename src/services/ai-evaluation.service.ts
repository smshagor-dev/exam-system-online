/**
 * src/services/ai-evaluation.service.ts
 * 
 * AI-Assisted answer evaluation service.
 * 
 * Currently a PLACEHOLDER - disabled by default.
 * To enable: set AI_EVALUATION_ENABLED=true in .env
 * To add OpenAI: implement the evaluateAnswer() method using the OpenAI SDK.
 * 
 * Design: AI only SUGGESTS marks/feedback. Teacher must confirm.
 * Final result is never published until teacher confirms AI suggestions.
 */

import { prisma } from '@/lib/prisma'
import { AnswerCheckStatus, QuestionType } from '@prisma/client'

export interface AiEvaluationResult {
  suggestedMarks: number
  feedback: string
  confidence: number // 0-1
}

class AiEvaluationService {
  /**
   * Check if AI evaluation is enabled via environment variable.
   */
  isEnabled(): boolean {
    return process.env.AI_EVALUATION_ENABLED === 'true'
  }

  /**
   * Evaluate a single answer using AI.
   * 
   * --- TO ADD OPENAI ---
   * 1. npm install openai
   * 2. Replace the placeholder below with:
   * 
   *   import OpenAI from 'openai'
   *   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
   *   const completion = await openai.chat.completions.create({
   *     model: 'gpt-4o',
   *     messages: [
   *       { role: 'system', content: EVALUATOR_SYSTEM_PROMPT },
   *       { role: 'user', content: prompt }
   *     ],
   *     response_format: { type: 'json_object' },
   *   })
   *   return JSON.parse(completion.choices[0].message.content!)
   */
  async evaluateAnswer(opts: {
    questionText: string
    questionType: QuestionType
    expectedAnswer: string | null
    studentAnswer: string
    maxMarks: number
  }): Promise<AiEvaluationResult> {
    if (!this.isEnabled()) {
      throw new Error('AI evaluation is disabled')
    }

    // ─── PLACEHOLDER IMPLEMENTATION ──────────────────────────────────────
    // This is a stub that returns zero marks until real AI is connected.
    // Replace this block with your AI API call.
    console.log('[AI] Evaluating answer (placeholder):', opts.questionText.slice(0, 50))

    // Simulate a delay as if calling an external API
    await new Promise((resolve) => setTimeout(resolve, 100))

    return {
      suggestedMarks: 0,
      feedback: 'AI evaluation is not yet configured. Please review manually.',
      confidence: 0,
    }
    // ─────────────────────────────────────────────────────────────────────
  }

  /**
   * Evaluate all pending short/written answers in an attempt.
   * Results are saved as AI_SUGGESTED — teacher must confirm.
   */
  async evaluateAttempt(attemptId: string): Promise<void> {
    const attempt = await prisma.studentExamAttempt.findUnique({
      where: { id: attemptId },
      include: {
        exam: {
          include: {
            questions: {
              include: { question: true },
            },
          },
        },
        answers: {
          where: {
            checkStatus: AnswerCheckStatus.UNCHECKED,
            answerText: { not: null },
          },
        },
      },
    })

    if (!attempt) return

    for (const answer of attempt.answers) {
      const examQuestion = attempt.exam.questions.find(
        (eq) => eq.questionId === answer.questionId
      )
      if (!examQuestion) continue

      const q = examQuestion.question

      // Only evaluate short/written answers
      if (
        q.type !== QuestionType.SHORT_ANSWER &&
        q.type !== QuestionType.WRITTEN_ANSWER
      ) {
        continue
      }

      try {
        const result = await this.evaluateAnswer({
          questionText: q.text,
          questionType: q.type,
          expectedAnswer: q.expectedAnswer,
          studentAnswer: answer.answerText ?? '',
          maxMarks: examQuestion.marks,
        })

        await prisma.studentAnswer.update({
          where: { id: answer.id },
          data: {
            checkStatus: AnswerCheckStatus.AI_SUGGESTED,
            aiSuggestedMarks: result.suggestedMarks,
            aiSuggestedFeedback: result.feedback,
          },
        })
      } catch (err) {
        console.error('[AI] Failed to evaluate answer:', answer.id, err)
      }
    }
  }

  /**
   * Teacher confirms AI suggestion (accept/edit/reject).
   * After confirmation, answer is marked CONFIRMED.
   */
  async confirmSuggestion(
    answerId: string,
    teacherId: string,
    finalMarks: number,
    feedback: string
  ): Promise<void> {
    await prisma.studentAnswer.update({
      where: { id: answerId },
      data: {
        teacherMarks: finalMarks,
        teacherFeedback: feedback,
        checkStatus: AnswerCheckStatus.CONFIRMED,
      },
    })
  }
}

// Export singleton
export const aiEvaluationService = new AiEvaluationService()
