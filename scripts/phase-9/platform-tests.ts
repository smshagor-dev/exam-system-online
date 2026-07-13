import fs from 'node:fs/promises'
import path from 'node:path'
import {
  Phase9AppealStatus,
  Phase9CertificateType,
  Phase9GradeComponentType,
  Phase9GraduationWorkflowStatus,
  Phase9MarksheetType,
  Phase9OfficerRoleType,
  Phase9ResultLifecycleStatus,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  buildPhase9Analytics,
  buildPhase9DegreeAudit,
  calculatePhase9Gradebook,
  createOrRefreshPhase9GraduationCandidate,
  createPhase9Appeal,
  createPhase9Gradebook,
  generatePhase9Certificate,
  generatePhase9Marksheet,
  generatePhase9Transcript,
  transitionPhase9GraduationCandidate,
  transitionPhase9ResultRecord,
  updatePhase9Appeal,
  upsertPhase9GradeEntries,
  verifyPhase9Document,
} from '@/lib/phase9-results'
import { ensurePhase9Fixtures } from './fixtures'

const evidencePath = path.join(process.cwd(), 'docs/phase-9/evidence/database/phase9-platform-tests.json')

async function main() {
  const fixtures = await ensurePhase9Fixtures()

  const officer = await prisma.phase9OfficerAssignment.create({
    data: {
      teacherId: fixtures.teacher.id,
      departmentId: fixtures.departments.cse.id,
      roleType: Phase9OfficerRoleType.CONTROLLER_OF_EXAMINATION,
      isActive: true,
    },
  })

  const gradebook = await createPhase9Gradebook({
    academicOfferingId: fixtures.offering.id,
    departmentId: fixtures.departments.cse.id,
    academicSessionId: fixtures.academicSession.id,
    programId: fixtures.offering.programId,
    semesterId: fixtures.offering.semesterId,
    groupId: fixtures.offering.groupId,
    teacherId: fixtures.teacher.id,
    title: `Phase 9 Platform Test ${Date.now()}`,
    components: [
      {
        type: Phase9GradeComponentType.INTERNAL,
        name: 'Internal',
        weight: 20,
        maxMarks: 20,
      },
      {
        type: Phase9GradeComponentType.COURSEWORK,
        name: 'Coursework',
        weight: 20,
        maxMarks: 20,
      },
      {
        type: Phase9GradeComponentType.ATTENDANCE,
        name: 'Attendance',
        weight: 10,
        maxMarks: 10,
      },
      {
        type: Phase9GradeComponentType.FINAL,
        name: 'Final Exam',
        weight: 50,
        maxMarks: 50,
      },
    ],
  })

  await upsertPhase9GradeEntries(
    gradebook.id,
    [
      {
        componentId: gradebook.components[0].id,
        studentId: fixtures.student.id,
        rawMarks: 18,
      },
    ],
    fixtures.teacher.userId
  )

  const calculation = await calculatePhase9Gradebook(gradebook.id, {
    userId: fixtures.users.cseAdmin.id,
    notes: 'Phase 9 automated platform test',
  })

  const resultRecord = await prisma.phase9ResultRecord.findFirstOrThrow({
    where: {
      gradebookId: gradebook.id,
      studentId: fixtures.student.id,
    },
  })

  const transitions: Phase9ResultLifecycleStatus[] = [
    Phase9ResultLifecycleStatus.VERIFIED,
    Phase9ResultLifecycleStatus.MODERATED,
    Phase9ResultLifecycleStatus.APPROVED,
    Phase9ResultLifecycleStatus.PUBLISHED,
  ]
  const transitionResults = []
  for (const status of transitions) {
    transitionResults.push(
      await transitionPhase9ResultRecord(resultRecord.id, status, {
        userId: fixtures.users.cseAdmin.id,
        notes: `Transitioned to ${status}`,
      })
    )
  }

  let lockedMessage = ''
  try {
    await upsertPhase9GradeEntries(
      gradebook.id,
      [
        {
          componentId: gradebook.components[0].id,
          studentId: fixtures.student.id,
          rawMarks: 10,
        },
      ],
      fixtures.teacher.userId
    )
  } catch (error) {
    lockedMessage = error instanceof Error ? error.message : String(error)
  }

  await buildPhase9DegreeAudit(fixtures.student.id)
  const graduationSeed = await createOrRefreshPhase9GraduationCandidate(fixtures.student.id)
  await prisma.phase9DegreeAudit.update({
    where: { id: graduationSeed.audit.id },
    data: {
      isEligible: true,
      completedCredits: graduationSeed.audit.requiredCredits,
      remainingCredits: 0,
      currentCgpa: Math.max(graduationSeed.audit.currentCgpa, 3.25),
      compulsoryOutstanding: [],
      electiveOutstanding: [],
      requirementSummary: {
        promotedBy: 'phase9-platform-tests',
        promotedAt: new Date().toISOString(),
      },
    },
  })
  const promotedAudit = await prisma.phase9DegreeAudit.findUniqueOrThrow({
    where: { id: graduationSeed.audit.id },
  })
  const graduationApproved = await transitionPhase9GraduationCandidate(
    graduationSeed.candidate.id,
    Phase9GraduationWorkflowStatus.APPROVED,
    fixtures.users.cseAdmin.id,
    'Approved during automated test'
  )
  const graduationCertified = await transitionPhase9GraduationCandidate(
    graduationSeed.candidate.id,
    Phase9GraduationWorkflowStatus.CERTIFIED,
    fixtures.users.cseAdmin.id,
    'Certified during automated test'
  )

  const transcript = await generatePhase9Transcript(fixtures.student.id, 'en', fixtures.users.cseAdmin.id)
  const marksheet = await generatePhase9Marksheet(
    fixtures.student.id,
    Phase9MarksheetType.CONSOLIDATED,
    'en',
    fixtures.users.cseAdmin.id
  )
  const certificate = await generatePhase9Certificate(
    fixtures.student.id,
    Phase9CertificateType.GRADUATION,
    'en',
    fixtures.users.cseAdmin.id,
    graduationCertified.graduationId ?? null,
    null
  )

  const appeal = await createPhase9Appeal({
    resultRecordId: resultRecord.id,
    studentId: fixtures.student.id,
    departmentId: fixtures.departments.cse.id,
    teacherId: fixtures.teacher.id,
    reason: 'Platform test appeal for published result review.',
  })
  const appealReview = await updatePhase9Appeal(appeal.id, {
    status: Phase9AppealStatus.RESOLVED,
    teacherResponse: 'Marks verified against the gradebook.',
    adminDecision: 'No change required after moderation audit.',
    reviewedByUserId: fixtures.users.cseAdmin.id,
  })

  const analytics = await buildPhase9Analytics({ departmentId: fixtures.departments.cse.id })
  const transcriptVerification = await verifyPhase9Document(transcript.transcript.verificationCode)
  const certificateVerification = await verifyPhase9Document(certificate.certificate.verificationCode)

  const payload = {
    status:
      calculation.calculatedCount > 0 &&
      transitionResults.at(-1)?.status === Phase9ResultLifecycleStatus.PUBLISHED &&
      promotedAudit.id &&
      graduationCertified.status === Phase9GraduationWorkflowStatus.CERTIFIED &&
      transcriptVerification?.valid &&
      certificateVerification?.valid &&
      analytics.totals.total > 0 &&
      lockedMessage.includes('locked')
        ? 'PASS'
        : 'BLOCKED',
    generatedAt: new Date().toISOString(),
    officerAssignmentId: officer.id,
    gradebookId: gradebook.id,
    calculation,
    resultRecordId: resultRecord.id,
    resultTransitions: transitionResults.map((item) => item.status),
    publicationLockMessage: lockedMessage,
    degreeAudit: {
      id: promotedAudit.id,
      isEligible: promotedAudit.isEligible,
      requiredCredits: promotedAudit.requiredCredits,
      completedCredits: promotedAudit.completedCredits,
      currentCgpa: promotedAudit.currentCgpa,
    },
    graduation: {
      candidateId: graduationSeed.candidate.id,
      approvedStatus: graduationApproved.status,
      certifiedStatus: graduationCertified.status,
      graduationId: graduationCertified.graduationId,
    },
    transcript: {
      id: transcript.transcript.id,
      verificationCode: transcript.transcript.verificationCode,
      filePath: transcript.filePath,
    },
    marksheet: {
      id: marksheet.marksheet.id,
      verificationCode: marksheet.marksheet.verificationCode,
      filePath: marksheet.filePath,
    },
    certificate: {
      id: certificate.certificate.id,
      certificateNumber: certificate.certificate.certificateNumber,
      verificationCode: certificate.certificate.verificationCode,
      filePath: certificate.filePath,
    },
    appeal: {
      id: appeal.id,
      status: appealReview.status,
      reviewedAt: appealReview.reviewedAt,
    },
    analytics: analytics.totals,
    verifications: {
      transcript: transcriptVerification,
      certificate: certificateVerification,
    },
  }

  await fs.mkdir(path.dirname(evidencePath), { recursive: true })
  await fs.writeFile(evidencePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(payload, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(async () => {
  await prisma.$disconnect().catch(() => {})
})
