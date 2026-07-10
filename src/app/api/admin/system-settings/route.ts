import { NextRequest, NextResponse } from 'next/server'
import { UserRole } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { getOrCreateSystemSettings, updateSystemSettings } from '@/lib/system-settings'
import { systemSettingsSchema } from '@/lib/validators'

export async function GET() {
  await requireRole(UserRole.SUPER_ADMIN)

  const settings = await getOrCreateSystemSettings()
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  await requireRole(UserRole.SUPER_ADMIN)

  const currentSettings = await getOrCreateSystemSettings()
  const body = await req.json()
  const parsed = systemSettingsSchema.safeParse({
    ...body,
    systemName: body.systemName ?? '',
    systemShortName: body.systemShortName ?? '',
    systemDescription: body.systemDescription ?? null,
    systemLogoUrl: body.systemLogoUrl ?? null,
    systemIconUrl: body.systemIconUrl ?? null,
    footerText: body.footerText ?? null,
    supportEmail: body.supportEmail ?? null,
    smtpHost: body.smtpHost ?? null,
    smtpPort: body.smtpPort === '' || body.smtpPort === undefined || body.smtpPort === null ? null : Number(body.smtpPort),
    smtpUser: body.smtpUser ?? null,
    smtpPass: body.smtpPass ?? null,
    mailFrom: body.mailFrom ?? null,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const data = parsed.data
  const settings = await updateSystemSettings({
    systemName: data.systemName.trim(),
    systemShortName: data.systemShortName.trim(),
    systemDescription: data.systemDescription?.trim() || null,
    systemLogoUrl: data.systemLogoUrl?.trim() || null,
    systemIconUrl: data.systemIconUrl?.trim() || null,
    footerText: data.footerText?.trim() || null,
    supportEmail: data.supportEmail?.trim() || null,
    smtpHost: data.smtpHost?.trim() || null,
    smtpPort: data.smtpPort ?? null,
    smtpSecure: data.smtpSecure,
    smtpUser: data.smtpUser?.trim() || null,
    smtpPass: data.smtpPass && data.smtpPass.trim() ? data.smtpPass : currentSettings.smtpPass,
    mailFrom: data.mailFrom?.trim() || null,
    requireEmailVerification: data.requireEmailVerification,
  })

  return NextResponse.json(settings)
}
