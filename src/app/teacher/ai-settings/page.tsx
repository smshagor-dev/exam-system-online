import { UserRole } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { getOrCreateSystemSettings } from '@/lib/system-settings'
import AiSettingsManager from '@/components/ai/AiSettingsManager'

export default async function TeacherAiSettingsPage() {
  await requireRole(UserRole.TEACHER)

  const settings = await getOrCreateSystemSettings()

  return (
    <AiSettingsManager
      audience="teacher"
      settings={{
        aiEnabled: settings.aiEnabled,
        aiProvider: settings.aiProvider,
        aiOpenAiModel: settings.aiOpenAiModel,
        aiGeminiModel: settings.aiGeminiModel,
        aiClaudeModel: settings.aiClaudeModel,
        aiTemperature: settings.aiTemperature,
        hasOpenAiApiKey: Boolean(settings.aiOpenAiApiKey),
        hasGeminiApiKey: Boolean(settings.aiGeminiApiKey),
        hasClaudeApiKey: Boolean(settings.aiClaudeApiKey),
      }}
    />
  )
}
