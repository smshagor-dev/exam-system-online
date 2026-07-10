import { prisma } from '@/lib/prisma'
import { AiProvider } from '@prisma/client'

const GLOBAL_SETTINGS_KEY = 'global'

export type SystemSettings = {
  id: string
  key: string
  systemName: string
  systemShortName: string
  systemDescription: string | null
  systemLogoUrl: string | null
  systemIconUrl: string | null
  footerText: string | null
  supportEmail: string | null
  aiEnabled: boolean
  aiProvider: AiProvider | null
  aiOpenAiApiKey: string | null
  aiOpenAiModel: string | null
  aiGeminiApiKey: string | null
  aiGeminiModel: string | null
  aiClaudeApiKey: string | null
  aiClaudeModel: string | null
  aiTemperature: number | null
  smtpHost: string | null
  smtpPort: number | null
  smtpSecure: boolean
  smtpUser: string | null
  smtpPass: string | null
  mailFrom: string | null
  requireEmailVerification: boolean
  createdAt: Date
  updatedAt: Date
}

export type MailConfig = {
  host: string
  port: number
  secure: boolean
  user?: string
  pass?: string
  from: string
}

export type BrandingConfig = {
  name: string
  shortName: string
  description: string
  logoUrl: string | null
  iconUrl: string | null
  footerText: string | null
  supportEmail: string | null
}

export type AiConfig = {
  enabled: boolean
  provider: AiProvider | null
  temperature: number
  openaiApiKey: string | null
  openaiModel: string
  geminiApiKey: string | null
  geminiModel: string
  claudeApiKey: string | null
  claudeModel: string
}

export async function getOrCreateSystemSettings(): Promise<SystemSettings> {
  const existing = await prisma.systemSetting.findUnique({
    where: { key: GLOBAL_SETTINGS_KEY },
  })

  if (existing) {
    return existing
  }

  return prisma.systemSetting.create({
    data: {
      key: GLOBAL_SETTINGS_KEY,
      systemName: 'ExamFlow Pro',
      systemShortName: 'EMS',
      systemDescription: 'Professional Online Exam Management System',
      aiEnabled: false,
      aiTemperature: 0.2,
      aiOpenAiModel: 'gpt-4o-mini',
      aiGeminiModel: 'gemini-2.5-flash',
      aiClaudeModel: 'claude-sonnet-4-20250514',
      requireEmailVerification: true,
    },
  })
}

export async function updateSystemSettings(
  data: Partial<Pick<SystemSettings, 'systemName' | 'systemShortName' | 'systemDescription' | 'systemLogoUrl' | 'systemIconUrl' | 'footerText' | 'supportEmail' | 'aiEnabled' | 'aiProvider' | 'aiOpenAiApiKey' | 'aiOpenAiModel' | 'aiGeminiApiKey' | 'aiGeminiModel' | 'aiClaudeApiKey' | 'aiClaudeModel' | 'aiTemperature' | 'smtpHost' | 'smtpPort' | 'smtpSecure' | 'smtpUser' | 'smtpPass' | 'mailFrom' | 'requireEmailVerification'>>
) {
  return prisma.systemSetting.upsert({
    where: { key: GLOBAL_SETTINGS_KEY },
    update: data,
    create: {
      key: GLOBAL_SETTINGS_KEY,
      systemName: 'ExamFlow Pro',
      systemShortName: 'EMS',
      systemDescription: 'Professional Online Exam Management System',
      aiEnabled: false,
      aiTemperature: 0.2,
      aiOpenAiModel: 'gpt-4o-mini',
      aiGeminiModel: 'gemini-2.5-flash',
      aiClaudeModel: 'claude-sonnet-4-20250514',
      requireEmailVerification: true,
      ...data,
    },
  })
}

export async function isEmailVerificationRequired() {
  const settings = await getOrCreateSystemSettings()
  return settings.requireEmailVerification
}

export async function getBrandingConfig(): Promise<BrandingConfig> {
  const settings = await getOrCreateSystemSettings()

  return {
    name: settings.systemName?.trim() || 'ExamFlow Pro',
    shortName: settings.systemShortName?.trim() || 'EMS',
    description: settings.systemDescription?.trim() || 'Professional Online Exam Management System',
    logoUrl: settings.systemLogoUrl?.trim() || null,
    iconUrl: settings.systemIconUrl?.trim() || null,
    footerText: settings.footerText?.trim() || null,
    supportEmail: settings.supportEmail?.trim() || null,
  }
}

export async function getAiConfig(): Promise<AiConfig> {
  const settings = await getOrCreateSystemSettings()

  return {
    enabled: settings.aiEnabled,
    provider: settings.aiProvider ?? null,
    temperature: settings.aiTemperature ?? 0.2,
    openaiApiKey: settings.aiOpenAiApiKey?.trim() || null,
    openaiModel: settings.aiOpenAiModel?.trim() || 'gpt-4o-mini',
    geminiApiKey: settings.aiGeminiApiKey?.trim() || null,
    geminiModel: settings.aiGeminiModel?.trim() || 'gemini-2.5-flash',
    claudeApiKey: settings.aiClaudeApiKey?.trim() || null,
    claudeModel: settings.aiClaudeModel?.trim() || 'claude-sonnet-4-20250514',
  }
}

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export async function getMailConfig(): Promise<MailConfig | null> {
  const settings = await getOrCreateSystemSettings()

  const host = normalizeOptional(settings.smtpHost) ?? normalizeOptional(process.env.SMTP_HOST)
  const portValue = settings.smtpPort ?? (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined)
  const from = normalizeOptional(settings.mailFrom) ?? normalizeOptional(process.env.MAIL_FROM)

  if (!host || !from || !portValue || Number.isNaN(portValue)) {
    return null
  }

  const user = normalizeOptional(settings.smtpUser) ?? normalizeOptional(process.env.SMTP_USER)
  const pass = normalizeOptional(settings.smtpPass) ?? normalizeOptional(process.env.SMTP_PASS)

  return {
    host,
    port: portValue,
    secure: settings.smtpHost || settings.smtpPort || settings.mailFrom || settings.smtpUser || settings.smtpPass
      ? settings.smtpSecure
      : process.env.SMTP_SECURE === 'true',
    user,
    pass,
    from,
  }
}
