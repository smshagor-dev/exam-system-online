import { NextResponse } from 'next/server'
import { getBrandingConfig, isEmailVerificationRequired } from '@/lib/system-settings'

export async function GET() {
  const branding = await getBrandingConfig()
  const requireEmailVerification = await isEmailVerificationRequired()

  return NextResponse.json({
    ...branding,
    requireEmailVerification,
  })
}
