import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/prisma'

const evidencePath = path.join(process.cwd(), 'docs/phase-8/evidence/database/phase8-verify.json')

async function main() {
  const [calendarCount, campusCount, roomCount, sessionCount, itemCount, seatPlanCount, dutyCount] = await Promise.all([
    prisma.examAcademicCalendar.count(),
    prisma.examCampus.count(),
    prisma.examRoom.count(),
    prisma.examSchedulingSession.count(),
    prisma.examScheduleItem.count(),
    prisma.examSeatPlan.count(),
    prisma.examDutyAssignment.count(),
  ])

  const payload = {
    status: calendarCount > 0 && campusCount > 0 && roomCount > 0 && sessionCount > 0 ? 'PASS' : 'BLOCKED',
    counts: {
      calendarCount,
      campusCount,
      roomCount,
      sessionCount,
      itemCount,
      seatPlanCount,
      dutyCount,
    },
    generatedAt: new Date().toISOString(),
  }

  await fs.mkdir(path.dirname(evidencePath), { recursive: true })
  await fs.writeFile(evidencePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(payload, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

