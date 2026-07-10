import { UserRole } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { getOrCreateSystemSettings } from '@/lib/system-settings'
import AiSettingsManager from '@/components/ai/AiSettingsManager'

export default async function AdminAiSettingsPage() {
  await requireRole(UserRole.SUPER_ADMIN)

  const settings = await getOrCreateSystemSettings()

  return (
    <AiSettingsManager
      audience="admin"
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
