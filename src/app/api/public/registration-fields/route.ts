import { NextRequest, NextResponse } from 'next/server'
import { getActiveRegistrationFields } from '@/lib/registration-fields'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const departmentId = searchParams.get('departmentId')

  if (!departmentId) {
    return NextResponse.json([])
  }

  const fields = await getActiveRegistrationFields(departmentId)
  return NextResponse.json(fields)
}
