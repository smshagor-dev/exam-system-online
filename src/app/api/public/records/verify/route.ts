import { NextRequest, NextResponse } from 'next/server'
import { verifyPhase9Document } from '@/lib/phase9-results'

export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get('code')?.trim()
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

  const record = await verifyPhase9Document(code)
  if (!record) return NextResponse.json({ error: 'Verification code not found' }, { status: 404 })
  return NextResponse.json(record)
}
