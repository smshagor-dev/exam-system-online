import { prisma } from '@/lib/prisma'
import { getAiConfig } from '@/lib/system-settings'
import { AiProvider, AnswerCheckStatus, QuestionType } from '@prisma/client'

export interface AiEvaluationResult {
  suggestedMarks: number
  feedback: string
  confidence: number
}

const EVALUATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    suggestedMarks: { type: 'number' },
    feedback: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['suggestedMarks', 'feedback', 'confidence'],
  additionalProperties: false,
}

function clamp(number: number, min: number, max: number) {
  return Math.min(max, Math.max(min, number))
}

function createPrompt(opts: {
  questionText: string
  questionType: QuestionType
  expectedAnswer: string | null
  studentAnswer: string
  maxMarks: number
}) {
  return [
    'Evaluate the student answer and return JSON only.',
    `Question type: ${opts.questionType}`,
    `Question: ${opts.questionText}`,
    `Expected answer: ${opts.expectedAnswer ?? 'Not provided'}`,
    `Student answer: ${opts.studentAnswer}`,
    `Maximum marks: ${opts.maxMarks}`,
    'Return an object with suggestedMarks, feedback, confidence.',
    'suggestedMarks must be between 0 and the maximum marks.',
    'confidence must be between 0 and 1.',
  ].join('\n')
}

function parseJsonObject(raw: string) {
  const trimmed = raw.trim()
  const directStart = trimmed.indexOf('{')
  const directEnd = trimmed.lastIndexOf('}')

  if (directStart === -1 || directEnd === -1 || directEnd <= directStart) {
    throw new Error('Provider did not return a JSON object.')
  }

  return JSON.parse(trimmed.slice(directStart, directEnd + 1))
}

function normalizeResult(data: unknown, maxMarks: number): AiEvaluationResult {
  if (!data || typeof data !== 'object') {
    throw new Error('AI evaluation response is invalid.')
  }

  const result = data as Record<string, unknown>
  const suggestedMarks = Number(result.suggestedMarks)
  const confidence = Number(result.confidence)
  const feedback = typeof result.feedback === 'string' ? result.feedback.trim() : ''

  if (Number.isNaN(suggestedMarks) || Number.isNaN(confidence) || !feedback) {
    throw new Error('AI evaluation response is missing required fields.')
  }

  return {
    suggestedMarks: clamp(suggestedMarks, 0, maxMarks),
    confidence: clamp(confidence, 0, 1),
    feedback,
  }
}

async function callOpenAi(prompt: string, apiKey: string, model: string, temperature: number) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: 'system', content: 'You are a strict academic evaluator. Reply with JSON only.' },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'answer_evaluation',
          schema: EVALUATION_JSON_SCHEMA,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI request failed: ${errorText}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content as string
}

async function callGemini(prompt: string, apiKey: string, model: string, temperature: number) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        responseMimeType: 'application/json',
        responseSchema: EVALUATION_JSON_SCHEMA,
      },
      systemInstruction: {
        parts: [{ text: 'You are a strict academic evaluator. Reply with JSON only.' }],
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini request failed: ${errorText}`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text as string
}

async function callClaude(prompt: string, apiKey: string, model: string, temperature: number) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      temperature,
      system: 'You are a strict academic evaluator. Reply with JSON only.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude request failed: ${errorText}`)
  }

  const data = await response.json()
  const content = Array.isArray(data.content) ? data.content.find((item: { type?: string }) => item.type === 'text') : null
  return content?.text as string
}

class AiEvaluationService {
  async isEnabled(): Promise<boolean> {
    const config = await getAiConfig()
    return config.enabled && Boolean(config.provider)
  }

  async evaluateAnswer(opts: {
    questionText: string
    questionType: QuestionType
    expectedAnswer: string | null
    studentAnswer: string
    maxMarks: number
  }): Promise<AiEvaluationResult> {
    const config = await getAiConfig()
    if (!config.enabled || !config.provider) {
      throw new Error('AI evaluation is disabled')
    }

    const prompt = createPrompt(opts)
    let raw = ''

    if (config.provider === AiProvider.OPENAI) {
      if (!config.openaiApiKey) throw new Error('OpenAI API key is missing')
      raw = await callOpenAi(prompt, config.openaiApiKey, config.openaiModel, config.temperature)
    }

    if (config.provider === AiProvider.GEMINI) {
      if (!config.geminiApiKey) throw new Error('Gemini API key is missing')
      raw = await callGemini(prompt, config.geminiApiKey, config.geminiModel, config.temperature)
    }

    if (config.provider === AiProvider.CLAUDE) {
      if (!config.claudeApiKey) throw new Error('Claude API key is missing')
      raw = await callClaude(prompt, config.claudeApiKey, config.claudeModel, config.temperature)
    }

    return normalizeResult(parseJsonObject(raw), opts.maxMarks)
  }

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
      const examQuestion = attempt.exam.questions.find((eq) => eq.questionId === answer.questionId)
      if (!examQuestion) continue

      const q = examQuestion.question
      if (q.type !== QuestionType.SHORT_ANSWER && q.type !== QuestionType.WRITTEN_ANSWER) {
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
      } catch (error) {
        console.error('[AI] Failed to evaluate answer:', answer.id, error)
      }
    }
  }

  async confirmSuggestion(answerId: string, teacherId: string, finalMarks: number, feedback: string): Promise<void> {
    void teacherId

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

export const aiEvaluationService = new AiEvaluationService()
