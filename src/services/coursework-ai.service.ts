import { getAiConfig } from '@/lib/system-settings'
import { AiProvider } from '@prisma/client'

type CourseworkValidationResult = {
  accepted: boolean
  feedback: string
  confidence: number
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    accepted: { type: 'boolean' },
    feedback: { type: 'string' },
    confidence: { type: 'number' },
  },
  required: ['accepted', 'feedback', 'confidence'],
  additionalProperties: false,
}

function parseJsonObject(raw: string) {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Provider did not return valid JSON')
  }

  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
}

function normalizeResult(data: Record<string, unknown>): CourseworkValidationResult {
  return {
    accepted: Boolean(data.accepted),
    feedback: typeof data.feedback === 'string' && data.feedback.trim() ? data.feedback.trim() : 'The uploaded report does not satisfy the coursework rules.',
    confidence: typeof data.confidence === 'number' ? Math.min(1, Math.max(0, data.confidence)) : 0,
  }
}

function createPrompt(rules: string, documentText: string) {
  return [
    'You validate whether a student coursework report matches teacher rules.',
    'Return JSON only.',
    'Set accepted=true only if the document clearly follows the rules.',
    'If it fails, feedback must explain what to fix for resubmission.',
    `Teacher rules:\n${rules}`,
    `Student document text:\n${documentText.slice(0, 15000)}`,
    'Return { accepted, feedback, confidence }.',
  ].join('\n\n')
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
        { role: 'system', content: 'You are a strict coursework compliance validator. Reply with JSON only.' },
        { role: 'user', content: prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'coursework_validation',
          schema: RESPONSE_SCHEMA,
        },
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI validation failed: ${await response.text()}`)
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
        responseSchema: RESPONSE_SCHEMA,
      },
      systemInstruction: {
        parts: [{ text: 'You are a strict coursework compliance validator. Reply with JSON only.' }],
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini validation failed: ${await response.text()}`)
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
      system: 'You are a strict coursework compliance validator. Reply with JSON only.',
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Claude validation failed: ${await response.text()}`)
  }

  const data = await response.json()
  const content = Array.isArray(data.content) ? data.content.find((item: { type?: string }) => item.type === 'text') : null
  return content?.text as string
}

export async function validateCourseworkWithAi(rules: string, documentText: string): Promise<CourseworkValidationResult | null> {
  const config = await getAiConfig()
  if (!config.enabled || !config.provider) {
    return null
  }

  const prompt = createPrompt(rules, documentText)
  let raw = ''

  if (config.provider === AiProvider.OPENAI) {
    if (!config.openaiApiKey) throw new Error('OpenAI API key is missing')
    raw = await callOpenAi(prompt, config.openaiApiKey, config.openaiModel, config.temperature)
  } else if (config.provider === AiProvider.GEMINI) {
    if (!config.geminiApiKey) throw new Error('Gemini API key is missing')
    raw = await callGemini(prompt, config.geminiApiKey, config.geminiModel, config.temperature)
  } else if (config.provider === AiProvider.CLAUDE) {
    if (!config.claudeApiKey) throw new Error('Claude API key is missing')
    raw = await callClaude(prompt, config.claudeApiKey, config.claudeModel, config.temperature)
  }

  return normalizeResult(parseJsonObject(raw))
}
