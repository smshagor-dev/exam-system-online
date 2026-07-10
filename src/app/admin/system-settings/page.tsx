import { UserRole } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { getOrCreateSystemSettings } from '@/lib/system-settings'
import SystemSettingsManager from './SystemSettingsManager'

export default async function SystemSettingsPage() {
  await requireRole(UserRole.SUPER_ADMIN)

  const settings = await getOrCreateSystemSettings()

  return (
    <SystemSettingsManager
      settings={{
        systemName: settings.systemName,
        systemShortName: settings.systemShortName,
        systemDescription: settings.systemDescription,
        systemLogoUrl: settings.systemLogoUrl,
        systemIconUrl: settings.systemIconUrl,
        footerText: settings.footerText,
        supportEmail: settings.supportEmail,
      }}
    />
  )
}
