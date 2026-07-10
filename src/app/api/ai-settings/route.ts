import { NextRequest, NextResponse } from 'next/server'
import { UserRole } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { aiSettingsSchema } from '@/lib/validators'
import { getOrCreateSystemSettings, updateSystemSettings } from '@/lib/system-settings'

export async function GET() {
  await requireRole(UserRole.SUPER_ADMIN, UserRole.TEACHER)

  const settings = await getOrCreateSystemSettings()
  return NextResponse.json({
    aiEnabled: settings.aiEnabled,
    aiProvider: settings.aiProvider,
    aiOpenAiModel: settings.aiOpenAiModel,
    aiGeminiModel: settings.aiGeminiModel,
    aiClaudeModel: settings.aiClaudeModel,
    aiTemperature: settings.aiTemperature ?? 0.2,
    hasOpenAiApiKey: Boolean(settings.aiOpenAiApiKey),
    hasGeminiApiKey: Boolean(settings.aiGeminiApiKey),
    hasClaudeApiKey: Boolean(settings.aiClaudeApiKey),
  })
}

export async function PUT(req: NextRequest) {
  await requireRole(UserRole.SUPER_ADMIN, UserRole.TEACHER)

  const current = await getOrCreateSystemSettings()
  const body = await req.json()
  const parsed = aiSettingsSchema.safeParse({
    ...body,
    aiTemperature: body.aiTemperature === '' || body.aiTemperature === undefined || body.aiTemperature === null
      ? 0.2
      : Number(body.aiTemperature),
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data
  const updated = await updateSystemSettings({
    aiEnabled: data.aiEnabled,
    aiProvider: data.aiProvider ?? null,
    aiOpenAiApiKey: data.aiOpenAiApiKey && data.aiOpenAiApiKey.trim() ? data.aiOpenAiApiKey : current.aiOpenAiApiKey,
    aiOpenAiModel: data.aiOpenAiModel?.trim() || current.aiOpenAiModel || 'gpt-4o-mini',
    aiGeminiApiKey: data.aiGeminiApiKey && data.aiGeminiApiKey.trim() ? data.aiGeminiApiKey : current.aiGeminiApiKey,
    aiGeminiModel: data.aiGeminiModel?.trim() || current.aiGeminiModel || 'gemini-2.5-flash',
    aiClaudeApiKey: data.aiClaudeApiKey && data.aiClaudeApiKey.trim() ? data.aiClaudeApiKey : current.aiClaudeApiKey,
    aiClaudeModel: data.aiClaudeModel?.trim() || current.aiClaudeModel || 'claude-sonnet-4-20250514',
    aiTemperature: data.aiTemperature,
  })

  return NextResponse.json({
    aiEnabled: updated.aiEnabled,
    aiProvider: updated.aiProvider,
    aiOpenAiModel: updated.aiOpenAiModel,
    aiGeminiModel: updated.aiGeminiModel,
    aiClaudeModel: updated.aiClaudeModel,
    aiTemperature: updated.aiTemperature,
    hasOpenAiApiKey: Boolean(updated.aiOpenAiApiKey),
    hasGeminiApiKey: Boolean(updated.aiGeminiApiKey),
    hasClaudeApiKey: Boolean(updated.aiClaudeApiKey),
  })
}
