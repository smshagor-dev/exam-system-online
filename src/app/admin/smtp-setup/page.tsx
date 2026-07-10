import { UserRole } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { getOrCreateSystemSettings } from '@/lib/system-settings'
import SmtpSetupManager from './SmtpSetupManager'

export default async function SmtpSetupPage() {
  await requireRole(UserRole.SUPER_ADMIN)

  const settings = await getOrCreateSystemSettings()

  return (
    <SmtpSetupManager
      settings={{
        systemName: settings.systemName,
        smtpHost: settings.smtpHost,
        smtpPort: settings.smtpPort,
        smtpSecure: settings.smtpSecure,
        smtpUser: settings.smtpUser,
        smtpPass: settings.smtpPass,
        mailFrom: settings.mailFrom,
        requireEmailVerification: settings.requireEmailVerification,
      }}
      hasStoredPassword={Boolean(settings.smtpPass)}
    />
  )
}
