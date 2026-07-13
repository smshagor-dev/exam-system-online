import fs from 'fs'
import path from 'path'
import { TeachingAssignmentRoleType, TeachingAssignmentStatus } from '@prisma/client/index'
import { prisma } from '../../src/lib/prisma'

const isApply = process.argv.includes('--apply')

async function main() {
  const legacyAssignments = await prisma.teacherAssignment.findMany({
    include: {
      academicOffering: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const report = {
    mode: isApply ? 'apply' : 'dry-run',
    scanned: legacyAssignments.length,
    eligible: 0,
    createdMemberships: 0,
    createdAssignments: 0,
    linkedLegacyAssignments: 0,
    ambiguous: [] as string[],
    skippedWithoutOffering: [] as string[],
    timestamp: new Date().toISOString(),
  }

  for (const legacy of legacyAssignments) {
    if (!legacy.academicOfferingId) {
      report.skippedWithoutOffering.push(legacy.id)
      continue
    }

    report.eligible += 1

    const membership = await prisma.teacherDepartmentMembership.findUnique({
      where: {
        teacherId_departmentId: {
          teacherId: legacy.teacherId,
          departmentId: legacy.departmentId,
        },
      },
    })

    if (!membership && isApply) {
      await prisma.teacherDepartmentMembership.create({
        data: {
          teacherId: legacy.teacherId,
          departmentId: legacy.departmentId,
          isPrimary: true,
          isActive: true,
        },
      })
      report.createdMemberships += 1
    }

    const existing = await prisma.teachingAssignment.findFirst({
      where: {
        legacyAssignmentId: legacy.id,
      },
    })

    if (existing) {
      report.linkedLegacyAssignments += 1
      continue
    }

    if (!isApply) {
      report.createdAssignments += 1
      continue
    }

    const ensuredMembership = await prisma.teacherDepartmentMembership.findUnique({
      where: {
        teacherId_departmentId: {
          teacherId: legacy.teacherId,
          departmentId: legacy.departmentId,
        },
      },
    })

    if (!ensuredMembership) {
      report.ambiguous.push(legacy.id)
      continue
    }

    await prisma.teachingAssignment.create({
      data: {
        teacherId: legacy.teacherId,
        membershipId: ensuredMembership.id,
        departmentId: legacy.departmentId,
        academicOfferingId: legacy.academicOfferingId,
        status: TeachingAssignmentStatus.ACTIVE,
        isPrimary: true,
        legacyAssignmentId: legacy.id,
        roles: {
          create: [
            {
              role: TeachingAssignmentRoleType.LEAD_TEACHER,
              isPrimary: true,
            },
          ],
        },
        approvals: {
          create: {
            action: TeachingAssignmentStatus.ACTIVE,
            statusTo: TeachingAssignmentStatus.ACTIVE,
            notes: 'Backfilled from legacy TeacherAssignment',
          },
        },
      },
    })

    report.createdAssignments += 1
    report.linkedLegacyAssignments += 1
  }

  const outDir = path.join(process.cwd(), 'docs', 'phase-4')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    path.join(outDir, 'BACKFILL_REPORT.md'),
    [
      '# Phase 4 Backfill Report',
      '',
      `- Mode: ${report.mode}`,
      `- Scanned legacy assignments: ${report.scanned}`,
      `- Eligible exact matches: ${report.eligible}`,
      `- Created memberships: ${report.createdMemberships}`,
      `- Created teaching assignments: ${report.createdAssignments}`,
      `- Linked legacy assignments: ${report.linkedLegacyAssignments}`,
      `- Missing offering mappings: ${report.skippedWithoutOffering.length}`,
      `- Ambiguous records: ${report.ambiguous.length}`,
      '',
      '```json',
      JSON.stringify(report, null, 2),
      '```',
    ].join('\n')
  )

  console.log(JSON.stringify(report, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
