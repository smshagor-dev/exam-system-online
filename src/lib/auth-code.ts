import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { getBrandingConfig, getMailConfig } from '@/lib/system-settings'

const CODE_TTL_MINUTES = 10

type CodePurpose = 'verify-account' | 'reset-password'

type SendCodeParams = {
  code: string
  email: string
  name?: string | null
  purpose: CodePurpose
}

type SendCodeResult = {
  sent: boolean
  debugCode?: string
}

export function createSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export function createExpiryDate(minutes = CODE_TTL_MINUTES) {
  return new Date(Date.now() + minutes * 60 * 1000)
}

export function createEmailVerificationCode() {
  return {
    code: createSixDigitCode(),
    expiresAt: createExpiryDate(),
  }
}

export function createPasswordResetCode() {
  return {
    code: createSixDigitCode(),
    expiresAt: createExpiryDate(),
  }
}

async function getMailTransport() {
  const config = await getMailConfig()

  if (!config) {
    return null
  }

  return {
    from: config.from,
    transporter: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.pass
        ? {
            user: config.user,
            pass: config.pass,
          }
        : undefined,
    }),
  }
}

export async function sendOneTimeCodeEmail({
  code,
  email,
  name,
  purpose,
}: SendCodeParams): Promise<SendCodeResult> {
  const recipientName = name?.trim() || 'there'
  const mail = await getMailTransport()
  const branding = await getBrandingConfig()

  const subject = purpose === 'verify-account'
    ? `Your ${branding.name} verification code`
    : `Your ${branding.name} password reset code`

  const intro = purpose === 'verify-account'
    ? `Use this 6-digit code to verify your ${branding.name} account.`
    : `Use this 6-digit code to reset your ${branding.name} password.`

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <p>Hello ${recipientName},</p>
      <p>${intro}</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 8px; color: #2563eb;">${code}</p>
      <p>This code will expire in ${CODE_TTL_MINUTES} minutes.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    </div>
  `

  if (!mail) {
    console.log(`[AUTH CODE] ${purpose} for ${email}: ${code}`)
    return {
      sent: false,
      debugCode: process.env.NODE_ENV === 'production' ? undefined : code,
    }
  }

  await mail.transporter.sendMail({
    from: mail.from,
    to: email,
    subject,
    html,
    text: `${intro} Code: ${code}. This code expires in ${CODE_TTL_MINUTES} minutes.`,
  })

  return { sent: true }
}

export async function sendTestEmail(to: string) {
  const mail = await getMailTransport()
  const branding = await getBrandingConfig()
  if (!mail) {
    throw new Error('SMTP settings are incomplete. Add host, port, and from address first.')
  }

  await mail.transporter.sendMail({
    from: mail.from,
    to,
    subject: `${branding.name} SMTP test email`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <p>Hello,</p>
        <p>Your ${branding.name} SMTP settings are working correctly.</p>
        <p>This test email was sent from the admin SMTP Setup page.</p>
      </div>
    `,
    text: `Your ${branding.name} SMTP settings are working correctly. This test email was sent from the admin SMTP Setup page.`,
  })
}

export async function storeVerificationCode(userId: string) {
  const verification = createEmailVerificationCode()

  await prisma.user.update({
    where: { id: userId },
    data: {
      emailVerificationCode: verification.code,
      emailVerificationExpiresAt: verification.expiresAt,
    },
  })

  return verification
}

export async function storePasswordResetCode(userId: string) {
  const reset = createPasswordResetCode()

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordResetCode: reset.code,
      passwordResetExpiresAt: reset.expiresAt,
    },
  })

  return reset
}
