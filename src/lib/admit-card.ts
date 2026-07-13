import { getBrandingConfig } from './system-settings'
import { buildSimplePdf, persistPrivatePdf } from './pdf'

type AdmitCardPayload = {
  admitCardId: string
  token: string
  verificationCode: string
  student: {
    name: string
    email: string
    department: string
    program: string
    academicSession: string
  }
  session: {
    name: string
    type: string
    issuedAt: Date
  }
  exams: Array<{
    subject: string
    campus: string
    building: string
    room: string
    scheduledStart: Date
    scheduledEnd: Date
    seatNumber: string | null
    barcode: string | null
    qrCode: string | null
  }>
}

export async function generateAdmitCardPdf(payload: AdmitCardPayload) {
  const branding = await getBrandingConfig()
  const lines = [
    branding.name,
    'Enterprise Examination Admit Card',
    `Generated: ${new Date().toISOString()}`,
    `Verification Code: ${payload.verificationCode}`,
    '',
    `Student: ${payload.student.name}`,
    `Email: ${payload.student.email}`,
    `Department: ${payload.student.department}`,
    `Program: ${payload.student.program}`,
    `Academic Session: ${payload.student.academicSession}`,
    `Exam Session: ${payload.session.name} (${payload.session.type})`,
    '',
  ]

  payload.exams.forEach((exam, index) => {
    lines.push(`Exam ${index + 1}: ${exam.subject}`)
    lines.push(`Time: ${exam.scheduledStart.toISOString()} -> ${exam.scheduledEnd.toISOString()}`)
    lines.push(`Campus: ${exam.campus}`)
    lines.push(`Building: ${exam.building}`)
    lines.push(`Room: ${exam.room}`)
    lines.push(`Seat: ${exam.seatNumber ?? 'TBA'}`)
    lines.push(`QR: ${exam.qrCode ?? 'N/A'}`)
    lines.push(`Barcode: ${exam.barcode ?? 'N/A'}`)
    lines.push('')
  })

  lines.push('Rules / Instructions')
  lines.push('1. Carry this admit card and a valid identity document.')
  lines.push('2. Arrive at least 30 minutes before the exam begins.')
  lines.push('3. Sit only in the assigned room and seat.')
  lines.push('4. Follow invigilator instructions at all times.')

  const buffer = buildSimplePdf(lines)
  const filePath = await persistPrivatePdf(`phase-8/admit-cards/${payload.admitCardId}.pdf`, buffer)

  return {
    filePath,
    buffer,
  }
}

