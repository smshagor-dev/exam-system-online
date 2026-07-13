import { NextRequest, NextResponse } from 'next/server'
import { buildPhase9Analytics } from '@/lib/phase9-results'
import { persistPrivatePdf } from '@/lib/pdf'
import { requirePhase9Permission } from '@/lib/phase9-route-auth'
import fs from 'node:fs/promises'
import path from 'node:path'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const departmentId = searchParams.get('departmentId')?.trim() ?? undefined
  const format = searchParams.get('format')?.trim() ?? 'json'
  if (!departmentId) return NextResponse.json({ error: 'departmentId is required' }, { status: 400 })

  const access = await requirePhase9Permission('analytics.read', { departmentId })
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const analytics = await buildPhase9Analytics({ departmentId })
  if (format === 'csv') {
    const filePath = path.join(process.cwd(), '.generated', 'phase-9', 'analytics', `analytics-${Date.now()}.csv`)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, analytics.csv, 'utf8')
    return new NextResponse(analytics.csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="phase9-analytics.csv"',
      },
    })
  }

  if (format === 'pdf') {
    await persistPrivatePdf(`phase-9/analytics/analytics-${Date.now()}.pdf`, analytics.pdf)
    return new NextResponse(analytics.pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="phase9-analytics.pdf"',
      },
    })
  }

  return NextResponse.json(analytics)
}
