import { PrismaClient } from '@prisma/client'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import {
  type AcademicOfferingWithRelations,
  buildCandidateSummary,
  getDatabaseName,
  loadManualMappingFile,
  resolveStudentSubject,
  resolveTeacherAssignment,
  validateManualMappings,
  type StudentSubjectWithRelations,
  type TeacherAssignmentWithRelations,
} from './backfill-support'

const prisma = new PrismaClient()

type Flags = {
  dryRun: boolean
  apply: boolean
  verbose: boolean
}

function parseFlags(): Flags {
  const args = new Set(process.argv.slice(2))
  return {
    dryRun: args.has('--dry-run') || !args.has('--apply'),
    apply: args.has('--apply'),
    verbose: args.has('--verbose'),
  }
}

async function ensureReportDir() {
  await mkdir(path.join(process.cwd(), 'docs', 'phase-2'), { recursive: true })
}

function buildTeacherAssignmentDoc(resolutions: ReturnType<typeof resolveTeacherAssignment>[]) {
  const lines = ['# Unresolved Teacher Assignments', '']

  for (const resolution of resolutions) {
    if (resolution.resolutionStatus === 'MAPPED') continue
    lines.push(`## ${resolution.recordId}`)
    lines.push(`- Classification: ${resolution.classification}`)
    lines.push(`- Resolution status: ${resolution.resolutionStatus}`)
    lines.push(`- Reason unresolved: ${resolution.reason}`)
    lines.push(`- Recommended action: ${resolution.recommendedAction}`)
    lines.push(`- Candidate offerings: ${resolution.candidateOfferings.length > 0 ? resolution.candidateOfferings.map(buildCandidateSummary).join('; ') : 'None'}`)
    if (resolution.acceptedDecision) {
      lines.push(`- Safe to keep unresolved: ${resolution.acceptedDecision.safeBecause}`)
      lines.push(`- Legacy fallback remains active: ${resolution.acceptedDecision.legacyBehavior}`)
      lines.push(`- Future phase: ${resolution.acceptedDecision.futurePhase}`)
      lines.push(`- Approved by: ${resolution.acceptedDecision.approvedBy ?? 'Not recorded'}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function buildStudentSubjectDoc(resolutions: ReturnType<typeof resolveStudentSubject>[], records: StudentSubjectWithRelations[]) {
  const lines = ['# Unresolved Student Subjects', '']

  for (const resolution of resolutions) {
    if (resolution.resolutionStatus === 'MAPPED') continue
    const record = records.find((item) => item.id === resolution.recordId)
    lines.push(`## ${resolution.recordId}`)
    lines.push(`- Student: ${record?.student.user.name ?? 'Unknown'} (${record?.student.user.email ?? 'unknown'})`)
    lines.push(`- Classification: ${resolution.classification}`)
    lines.push(`- Resolution status: ${resolution.resolutionStatus}`)
    lines.push(`- Reason unresolved: ${resolution.reason}`)
    lines.push(`- Recommended action: ${resolution.recommendedAction}`)
    lines.push(`- Candidate offerings: ${resolution.candidateOfferings.length > 0 ? resolution.candidateOfferings.map(buildCandidateSummary).join('; ') : 'None'}`)
    if (resolution.acceptedDecision) {
      lines.push(`- Safe to keep unresolved: ${resolution.acceptedDecision.safeBecause}`)
      lines.push(`- Legacy fallback remains active: ${resolution.acceptedDecision.legacyBehavior}`)
      lines.push(`- Future phase: ${resolution.acceptedDecision.futurePhase}`)
      lines.push(`- Approved by: ${resolution.acceptedDecision.approvedBy ?? 'Not recorded'}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

async function main() {
  const flags = parseFlags()
  const databaseName = getDatabaseName(process.env.DATABASE_URL)

  if (flags.apply) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Phase 2 backfill refuses to run in production mode.')
    }
    if (process.env.ALLOW_PHASE2_BACKFILL !== 'true') {
      throw new Error('Set ALLOW_PHASE2_BACKFILL=true to run the Phase 2 apply backfill.')
    }
  }

  const manualMappings = await loadManualMappingFile()

  const [teacherAssignments, studentSubjects, offerings]: [TeacherAssignmentWithRelations[], StudentSubjectWithRelations[], AcademicOfferingWithRelations[]] = await Promise.all([
    prisma.teacherAssignment.findMany({
      include: {
        teacher: { include: { user: true } },
        department: true,
        subject: true,
        language: true,
        group: true,
        academicYear: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.studentSubject.findMany({
      include: {
        student: { include: { user: true, department: true } },
        subject: true,
        language: true,
        group: true,
        academicYear: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.academicOffering.findMany({
      include: {
        academicSession: true,
        program: true,
        department: true,
        language: true,
        programYear: true,
        semester: true,
        group: true,
        subject: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const teacherResolutions = teacherAssignments.map((record) => resolveTeacherAssignment(record, offerings, manualMappings))
  const studentResolutions = studentSubjects.map((record) => resolveStudentSubject(record, offerings, manualMappings))

  await validateManualMappings(prisma, [...teacherResolutions, ...studentResolutions], offerings, manualMappings)

  if (flags.apply) {
    for (const resolution of [...teacherResolutions, ...studentResolutions]) {
      if (resolution.resolutionStatus !== 'MAPPED' || !resolution.selectedOfferingId) continue

      if (resolution.recordType === 'teacherAssignments') {
        await prisma.teacherAssignment.update({
          where: { id: resolution.recordId },
          data: { academicOfferingId: resolution.selectedOfferingId },
        })
      } else {
        await prisma.studentSubject.update({
          where: { id: resolution.recordId },
          data: { academicOfferingId: resolution.selectedOfferingId },
        })
      }
    }
  }

  const teacherSummary = {
    total: teacherResolutions.length,
    resolved: teacherResolutions.filter((item) => item.resolutionStatus === 'MAPPED').length,
    acceptedUnresolved: teacherResolutions.filter((item) => item.resolutionStatus === 'EXPLICITLY_ACCEPTED_UNRESOLVED').length,
    ambiguous: teacherResolutions.filter((item) => item.classification === 'AMBIGUOUS_MULTIPLE_CANDIDATES').length,
    failed: teacherResolutions.filter((item) => item.resolutionStatus === 'UNRESOLVED').length,
  }

  const studentSummary = {
    total: studentResolutions.length,
    resolved: studentResolutions.filter((item) => item.resolutionStatus === 'MAPPED').length,
    acceptedUnresolved: studentResolutions.filter((item) => item.resolutionStatus === 'EXPLICITLY_ACCEPTED_UNRESOLVED').length,
    ambiguous: studentResolutions.filter((item) => item.classification === 'AMBIGUOUS_MULTIPLE_CANDIDATES').length,
    failed: studentResolutions.filter((item) => item.resolutionStatus === 'UNRESOLVED').length,
  }

  const report = [
    '# Backfill Report',
    '',
    `Mode: ${flags.apply ? 'APPLY' : 'DRY RUN'}`,
    `Database: ${databaseName}`,
    `Environment: ${process.env.NODE_ENV ?? 'unknown'}`,
    '',
    '## Result Summary',
    '```json',
    JSON.stringify(
      {
        teacherAssignments: teacherSummary,
        studentSubjects: studentSummary,
      },
      null,
      2
    ),
    '```',
    '',
    '## Decision Notes',
    '- The backfill only maps records when a validated manual mapping exists or exactly one compatible academic offering can be proven.',
    '- Records listed as `EXPLICITLY_ACCEPTED_UNRESOLVED` remain legacy-only by design and are documented in the unresolved reports.',
  ].join('\n')

  await ensureReportDir()
  await Promise.all([
    writeFile(path.join(process.cwd(), 'docs', 'phase-2', 'BACKFILL_REPORT.md'), report, 'utf8'),
    writeFile(path.join(process.cwd(), 'docs', 'phase-2', 'UNRESOLVED_TEACHER_ASSIGNMENTS.md'), buildTeacherAssignmentDoc(teacherResolutions), 'utf8'),
    writeFile(path.join(process.cwd(), 'docs', 'phase-2', 'UNRESOLVED_STUDENT_SUBJECTS.md'), buildStudentSubjectDoc(studentResolutions, studentSubjects), 'utf8'),
  ])

  console.log(report)

  if ([...teacherResolutions, ...studentResolutions].some((item) => item.resolutionStatus === 'UNRESOLVED')) {
    process.exit(1)
  }
}

main()
  .catch((error) => {
    console.error('[Phase 2 Backfill] Failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
