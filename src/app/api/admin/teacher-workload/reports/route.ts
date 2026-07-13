import { NextRequest, NextResponse } from 'next/server'
import { getAdminScope } from '@/lib/admin-scope'
import {
  buildMinimumAssignmentCsv,
  getTeacherReportingSnapshot,
} from '@/lib/teaching-assignment-admin'

export async function GET(req: NextRequest) {
  const scope = await getAdminScope()
  const { searchParams } = new URL(req.url)
  const format = searchParams.get('format')
  const snapshot = await getTeacherReportingSnapshot(scope)

  if (format === 'csv') {
    return new NextResponse(buildMinimumAssignmentCsv(snapshot), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="phase4-teaching-assignment-summary.csv"',
      },
    })
  }

  return NextResponse.json(snapshot)
}
