import { PrismaClient } from '@prisma/client'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { loadManualMappingFile, resolveStudentSubject, resolveTeacherAssignment } from './backfill-support'

const prisma = new PrismaClient()

async function ensureReportDir() {
  await mkdir(path.join(process.cwd(), 'docs', 'phase-2'), { recursive: true })
}

async function main() {
  const failures: string[] = []
  const warnings: string[] = []

  const manualMappings = await loadManualMappingFile()

  const [
    programs,
    departmentLanguages,
    groups,
    programYears,
    programSemesters,
    programSubjects,
    offerings,
    teacherAssignments,
    studentSubjects,
  ] = await Promise.all([
    prisma.academicProgram.findMany({ include: { degreeLevel: true, department: true } }),
    prisma.departmentLanguage.findMany(),
    prisma.group.findMany(),
    prisma.programYear.findMany({ include: { program: true } }),
    prisma.programSemester.findMany({ include: { program: true, programYear: true } }),
    prisma.programSubject.findMany({ include: { program: true, programYear: true } }),
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
    }),
    prisma.teacherAssignment.findMany({
      include: {
        teacher: { include: { user: true } },
        department: true,
        subject: true,
        language: true,
        group: true,
        academicYear: true,
      },
    }),
    prisma.studentSubject.findMany({
      include: {
        student: { include: { user: true, department: true } },
        subject: true,
        language: true,
        group: true,
        academicYear: true,
      },
    }),
  ])

  for (const program of programs) {
    if (!program.departmentId) failures.push(`Program ${program.code} is missing a department`)
    if (!program.degreeLevelId) failures.push(`Program ${program.code} is missing a degree level`)
  }

  const departmentLanguageSeen = new Set<string>()
  for (const item of departmentLanguages) {
    const key = `${item.departmentId}:${item.languageId}`
    if (departmentLanguageSeen.has(key)) {
      failures.push(`Duplicate department-language combination ${key}`)
    }
    departmentLanguageSeen.add(key)
  }

  for (const group of groups) {
    if (group.departmentLanguageId && !group.languageId) {
      failures.push(`Group ${group.code} has departmentLanguageId without languageId`)
    }
  }

  for (const programYear of programYears) {
    if (programYear.yearNumber > programYear.program.durationYears) {
      failures.push(`Program year ${programYear.code} exceeds duration for ${programYear.program.code}`)
    }
  }

  for (const mapping of programSemesters) {
    if (mapping.programYear.programId !== mapping.programId) {
      failures.push(`Program semester ${mapping.id} links a year from another program`)
    }
  }

  for (const curriculum of programSubjects) {
    if (curriculum.programYear.programId !== curriculum.programId) {
      failures.push(`Program subject ${curriculum.id} links a year from another program`)
    }
  }

  const offeringKeys = new Set<string>()
  for (const offering of offerings) {
    const key = [
      offering.academicSessionId,
      offering.programId,
      offering.languageId,
      offering.programYearId,
      offering.semesterId,
      offering.groupId,
      offering.subjectId,
    ].join(':')
    if (offeringKeys.has(key)) {
      failures.push(`Duplicate academic offering ${key}`)
    }
    offeringKeys.add(key)
  }

  const teacherResolutions = teacherAssignments.map((record) => resolveTeacherAssignment(record, offerings, manualMappings))
  const studentResolutions = studentSubjects.map((record) => resolveStudentSubject(record, offerings, manualMappings))

  for (const resolution of [...teacherResolutions, ...studentResolutions]) {
    if (resolution.resolutionStatus === 'UNRESOLVED') {
      failures.push(`${resolution.recordType}/${resolution.recordId} remains unresolved without an explicit decision`)
    } else if (resolution.resolutionStatus === 'EXPLICITLY_ACCEPTED_UNRESOLVED') {
      warnings.push(`${resolution.recordType}/${resolution.recordId} is accepted unresolved: ${resolution.classification}`)
    }
  }

  const report = [
    '# Academic Data Integrity Report',
    '',
    '## Critical Failures',
    ...(failures.length > 0 ? failures.map((item) => `- ${item}`) : ['- None']),
    '',
    '## Accepted Unresolved / Warnings',
    ...(warnings.length > 0 ? warnings.map((item) => `- ${item}`) : ['- None']),
  ].join('\n')

  await ensureReportDir()
  await writeFile(path.join(process.cwd(), 'docs', 'phase-2', 'ACADEMIC_DATA_INTEGRITY_REPORT.md'), report, 'utf8')

  console.log(report)

  if (failures.length > 0) {
    process.exit(1)
  }
}

main()
  .catch((error) => {
    console.error('[Phase 2 Verify] Failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
