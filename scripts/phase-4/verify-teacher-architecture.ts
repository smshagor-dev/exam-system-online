import fs from 'fs'
import path from 'path'
import { TeacherSubstitutionStatus, TeachingAssignmentStatus } from '@prisma/client/index'
import { prisma } from '../../src/lib/prisma'
import { calculateTeacherWeeklyWorkload, detectAssignmentConflicts } from '../../src/lib/teacher-workload'

type Finding = {
  severity: 'CRITICAL' | 'WARNING'
  code: string
  message: string
}

async function main() {
  const findings: Finding[] = []

  const [memberships, assignments, substitutions] = await Promise.all([
    prisma.teacherDepartmentMembership.findMany(),
    prisma.teachingAssignment.findMany({
      include: {
        academicOffering: true,
        roles: true,
        teacher: { include: { user: true } },
      },
    }),
    prisma.teacherSubstitution.findMany(),
  ])

  const primaryByTeacher = new Map<string, number>()
  for (const membership of memberships) {
    if (membership.isPrimary && membership.isActive) {
      primaryByTeacher.set(membership.teacherId, (primaryByTeacher.get(membership.teacherId) ?? 0) + 1)
    }
  }

  for (const [teacherId, count] of primaryByTeacher.entries()) {
    if (count > 1) {
      findings.push({
        severity: 'CRITICAL',
        code: 'MULTIPLE_PRIMARY_MEMBERSHIPS',
        message: `Teacher ${teacherId} has ${count} active primary memberships`,
      })
    }
  }

  for (const assignment of assignments) {
    if (!assignment.teacher?.user?.isActive && assignment.status === TeachingAssignmentStatus.ACTIVE) {
      findings.push({
        severity: 'CRITICAL',
        code: 'INACTIVE_TEACHER_ACTIVE_ASSIGNMENT',
        message: `Assignment ${assignment.id} is active for inactive teacher ${assignment.teacherId}`,
      })
    }

    if (assignment.startsAt && assignment.endsAt && assignment.endsAt < assignment.startsAt) {
      findings.push({
        severity: 'CRITICAL',
        code: 'INVALID_ASSIGNMENT_DATES',
        message: `Assignment ${assignment.id} ends before it starts`,
      })
    }

    if (assignment.roles.length === 0) {
      findings.push({
        severity: 'WARNING',
        code: 'MISSING_ASSIGNMENT_ROLE',
        message: `Assignment ${assignment.id} has no explicit role`,
      })
    }

    const workload = calculateTeacherWeeklyWorkload([
      {
        weeklyHours: assignment.weeklyHours,
        lectureHours: assignment.lectureHours,
        labHours: assignment.labHours,
        consultationHours: assignment.consultationHours,
        assessmentHours: assignment.assessmentHours,
      },
    ])

    const conflicts = detectAssignmentConflicts({
      weeklyHours: workload.totalHours,
      assignments: [
        {
          academicOfferingId: assignment.academicOfferingId,
          startsAt: assignment.startsAt,
          endsAt: assignment.endsAt,
        },
      ],
    })

    for (const conflict of conflicts) {
      findings.push({
        severity: conflict.severity === 'ERROR' ? 'CRITICAL' : 'WARNING',
        code: 'WORKLOAD_CONFLICT',
        message: `${assignment.id}: ${conflict.message}`,
      })
    }
  }

  for (const substitution of substitutions) {
    if (substitution.endsAt < substitution.startsAt) {
      findings.push({
        severity: 'CRITICAL',
        code: 'INVALID_SUBSTITUTION_DATES',
        message: `Substitution ${substitution.id} ends before it starts`,
      })
    }
    if (
      substitution.status === TeacherSubstitutionStatus.ACTIVE &&
      substitution.originalTeacherId === substitution.substituteTeacherId
    ) {
      findings.push({
        severity: 'WARNING',
        code: 'SELF_SUBSTITUTION',
        message: `Substitution ${substitution.id} uses the same teacher as original and substitute`,
      })
    }
  }

  const outDir = path.join(process.cwd(), 'docs', 'phase-4')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    path.join(outDir, 'TEACHER_ARCHITECTURE_INTEGRITY_REPORT.md'),
    [
      '# Phase 4 Teacher Architecture Integrity Report',
      '',
      `- Critical findings: ${findings.filter((item) => item.severity === 'CRITICAL').length}`,
      `- Warning findings: ${findings.filter((item) => item.severity === 'WARNING').length}`,
      '',
      '```json',
      JSON.stringify(findings, null, 2),
      '```',
    ].join('\n')
  )

  if (findings.some((item) => item.severity === 'CRITICAL')) {
    console.error(JSON.stringify(findings, null, 2))
    process.exit(1)
  }

  console.log(JSON.stringify({ status: 'PASS', findings }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
