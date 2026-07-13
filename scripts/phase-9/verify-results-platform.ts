import fs from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '@/lib/prisma'

const evidencePath = path.join(process.cwd(), 'docs/phase-9/evidence/database/phase9-verify.json')

async function main() {
  const [
    gradebookCount,
    resultCount,
    transitionCount,
    degreeAuditCount,
    transcriptCount,
    marksheetCount,
    certificateCount,
    appealCount,
    graduationCandidateCount,
    officerCount,
    policyCount,
  ] = await Promise.all([
    prisma.phase9Gradebook.count(),
    prisma.phase9ResultRecord.count(),
    prisma.phase9ResultTransition.count(),
    prisma.phase9DegreeAudit.count(),
    prisma.phase9TranscriptRecord.count(),
    prisma.phase9MarksheetRecord.count(),
    prisma.phase9CertificateRecord.count(),
    prisma.phase9ResultAppeal.count(),
    prisma.phase9GraduationCandidate.count(),
    prisma.phase9OfficerAssignment.count(),
    prisma.phase9ResultPolicy.count(),
  ])

  const payload = {
    status:
      gradebookCount > 0 &&
      resultCount > 0 &&
      transitionCount > 0 &&
      degreeAuditCount > 0 &&
      transcriptCount > 0 &&
      marksheetCount > 0 &&
      certificateCount > 0 &&
      appealCount > 0 &&
      graduationCandidateCount > 0 &&
      officerCount > 0 &&
      policyCount > 0
        ? 'PASS'
        : 'BLOCKED',
    generatedAt: new Date().toISOString(),
    counts: {
      gradebookCount,
      resultCount,
      transitionCount,
      degreeAuditCount,
      transcriptCount,
      marksheetCount,
      certificateCount,
      appealCount,
      graduationCandidateCount,
      officerCount,
      policyCount,
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
