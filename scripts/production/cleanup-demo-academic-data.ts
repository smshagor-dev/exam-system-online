import { PrismaClient } from '@prisma/client/index'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

type Mode = 'dry-run' | 'apply'

type Classification =
  | 'REAL_REQUIRED_REFERENCE_DATA'
  | 'DEMO_DATA'
  | 'SYSTEM_DEFAULT'
  | 'UNKNOWN_REQUIRES_MANUAL_DECISION'

type RecommendedAction = 'KEEP' | 'REMOVE_FROM_PRODUCTION' | 'REVIEW_MANUALLY'

type SourceTag =
  | 'LEGACY_DEMO_SEED'
  | 'PHASE_TEST_FIXTURE'
  | 'DERIVED_FROM_DEMO_STRUCTURE'
  | 'UNKNOWN'

type InventoryRecord = {
  model: string
  recordId: string
  name: string
  code: string | null
  createdAt: string
  createdSource: SourceTag
  relations: Record<string, number>
  classification: Classification
  recommendedAction: RecommendedAction
  rationale: string
}

type InventoryRecordBase = Omit<InventoryRecord, 'classification' | 'recommendedAction' | 'rationale'>

const prisma = new PrismaClient()
const rootDir = process.cwd()
const releaseDir = path.join(rootDir, 'docs', 'production-release')
const evidenceDir = path.join(releaseDir, 'evidence', 'academic-cleanup')

const LEGACY_DEMO_DEPARTMENT_CODES = new Set(['CSE', 'EEE', 'BBA'])
const LEGACY_DEMO_SUBJECT_CODES = new Set(['CSE-201', 'CSE-301', 'CSE-401', 'EEE-101', 'BBA-101'])
const LEGACY_DEMO_LANGUAGE_CODES = new Set(['EN', 'BN', 'AR'])
const PHASE_TEST_LANGUAGE_CODES = new Set(['RU'])
const LEGACY_DEMO_GROUP_CODES = new Set(['GRP-A', 'GRP-B', 'GRP-C', 'MSC-AI-11E'])
const PHASE_TEST_GROUP_CODES = new Set(['BSC-CS-11E', 'BSC-CS-11R', 'EEE-RU-11'])
const LEGACY_DEMO_ACADEMIC_YEARS = new Set(['Year 1', 'Year 2', 'Year 3', 'Year 4'])
const LEGACY_DEMO_SEMESTERS = new Set(['Semester 1', 'Semester 2'])
const LEGACY_DEMO_DEGREE_LEVELS = new Set(['BSC', 'MSC'])
const LEGACY_DEMO_PROGRAM_CODES = new Set(['BSC-CS', 'MSC-AI'])
const PHASE_TEST_PROGRAM_CODES = new Set(['BSC-EEE'])
const LEGACY_DEMO_SESSION_CODES = new Set(['2026-2027'])
const PHASE_TEST_SESSION_CODES = new Set(['2025-2026'])
const LEGACY_DEMO_PROGRAM_YEAR_CODES = new Set(['BSC-Y1', 'BSC-Y2', 'BSC-Y3', 'BSC-Y4', 'MSC-Y1', 'MSC-Y2'])
const PHASE_TEST_PROGRAM_YEAR_CODES = new Set(['EEE-Y1', 'EEE-Y2', 'EEE-Y3', 'EEE-Y4'])

function parseMode(): Mode {
  return process.argv.includes('--apply') ? 'apply' : 'dry-run'
}

function assertApplyAllowed(mode: Mode) {
  if (mode === 'apply' && process.env.ALLOW_PRODUCTION_DATA_CLEANUP !== 'true') {
    throw new Error('Apply mode requires ALLOW_PRODUCTION_DATA_CLEANUP=true.')
  }
}

function sumRelations(relations: Record<string, number>) {
  return Object.values(relations).reduce((sum, value) => sum + value, 0)
}

function hasAnchor(relations: Record<string, number>, keys: string[]) {
  return keys.some((key) => (relations[key] ?? 0) > 0)
}

function getSourceTag(model: string, code: string | null, name: string): SourceTag {
  switch (model) {
    case 'Department':
      if (code && LEGACY_DEMO_DEPARTMENT_CODES.has(code)) return 'LEGACY_DEMO_SEED'
      break
    case 'Subject':
      if (code && LEGACY_DEMO_SUBJECT_CODES.has(code)) return 'LEGACY_DEMO_SEED'
      if (code && ['CSE-101', 'CSE-501', 'EEE-201'].includes(code)) return 'PHASE_TEST_FIXTURE'
      break
    case 'Language':
      if (code && LEGACY_DEMO_LANGUAGE_CODES.has(code)) return 'LEGACY_DEMO_SEED'
      if (code && PHASE_TEST_LANGUAGE_CODES.has(code)) return 'PHASE_TEST_FIXTURE'
      break
    case 'Group':
      if (code && LEGACY_DEMO_GROUP_CODES.has(code)) return 'LEGACY_DEMO_SEED'
      if (code && PHASE_TEST_GROUP_CODES.has(code)) return 'PHASE_TEST_FIXTURE'
      break
    case 'AcademicYear':
      if (LEGACY_DEMO_ACADEMIC_YEARS.has(name)) return 'LEGACY_DEMO_SEED'
      break
    case 'Semester':
      if (LEGACY_DEMO_SEMESTERS.has(name)) return 'LEGACY_DEMO_SEED'
      break
    case 'DegreeLevel':
      if (code && LEGACY_DEMO_DEGREE_LEVELS.has(code)) return 'LEGACY_DEMO_SEED'
      break
    case 'AcademicProgram':
      if (code && LEGACY_DEMO_PROGRAM_CODES.has(code)) return 'LEGACY_DEMO_SEED'
      if (code && PHASE_TEST_PROGRAM_CODES.has(code)) return 'PHASE_TEST_FIXTURE'
      break
    case 'AcademicSession':
      if (code && LEGACY_DEMO_SESSION_CODES.has(code)) return 'LEGACY_DEMO_SEED'
      if (code && PHASE_TEST_SESSION_CODES.has(code)) return 'PHASE_TEST_FIXTURE'
      break
    case 'ProgramYear':
      if (code && LEGACY_DEMO_PROGRAM_YEAR_CODES.has(code)) return 'LEGACY_DEMO_SEED'
      if (code && PHASE_TEST_PROGRAM_YEAR_CODES.has(code)) return 'PHASE_TEST_FIXTURE'
      return 'DERIVED_FROM_DEMO_STRUCTURE'
    case 'ProgramSemester':
    case 'ProgramSubject':
    case 'DepartmentLanguage':
    case 'AcademicOffering':
      return 'DERIVED_FROM_DEMO_STRUCTURE'
  }

  return 'UNKNOWN'
}

function classifyRecord(record: InventoryRecordBase): Pick<InventoryRecord, 'classification' | 'recommendedAction' | 'rationale'> {
  const relationTotal = sumRelations(record.relations)
  const runtimeAnchors = [
    'academicOfferings',
    'groups',
    'scheduledExamItems',
    'academicCalendars',
    'schedulingSessions',
    'programs',
    'subjects',
    'departmentLanguages',
    'programYears',
    'programSemesters',
    'programSubjects',
    'courseworkPublications',
    'teacherAssignments',
    'teachingAssignments',
    'studentSubjects',
    'department',
    'program',
    'degreeLevel',
    'session',
  ]

  if (
    record.model === 'Department' &&
    record.createdSource === 'LEGACY_DEMO_SEED' &&
    (record.relations.programs ?? 0) === 0 &&
    (record.relations.academicOfferings ?? 0) === 0 &&
    (record.relations.scheduledExamItems ?? 0) === 0 &&
    (record.relations.academicCalendars ?? 0) === 0 &&
    (record.relations.schedulingSessions ?? 0) === 0 &&
    (record.relations.teachers ?? 0) === 0 &&
    (record.relations.students ?? 0) === 0 &&
    (record.relations.enrollments ?? 0) === 0
  ) {
    return {
      classification: 'DEMO_DATA',
      recommendedAction: 'REMOVE_FROM_PRODUCTION',
      rationale: 'The department has no retained runtime anchors and only preserves demo-era catalog structure.',
    }
  }

  if (record.model === 'Language' && record.code === 'EN' && relationTotal > 0) {
    return {
      classification: 'SYSTEM_DEFAULT',
      recommendedAction: 'KEEP',
      rationale: 'English is an active academic language and a production default.',
    }
  }

  if (record.model === 'AcademicSession' && record.code === '2026-2027' && hasAnchor(record.relations, ['groups', 'academicOfferings', 'academicCalendars', 'schedulingSessions'])) {
    return {
      classification: 'REAL_REQUIRED_REFERENCE_DATA',
      recommendedAction: 'KEEP',
      rationale: 'The current academic session is actively referenced by offerings and scheduling records.',
    }
  }

  if (hasAnchor(record.relations, runtimeAnchors) && relationTotal > 0) {
    return {
      classification: 'REAL_REQUIRED_REFERENCE_DATA',
      recommendedAction: 'KEEP',
      rationale: 'The record is actively referenced by retained academic structures or runtime scheduling data.',
    }
  }

  if (record.createdSource === 'LEGACY_DEMO_SEED' || record.createdSource === 'PHASE_TEST_FIXTURE' || record.createdSource === 'DERIVED_FROM_DEMO_STRUCTURE') {
    return {
      classification: 'DEMO_DATA',
      recommendedAction: 'REMOVE_FROM_PRODUCTION',
      rationale: 'The record is not anchored by retained runtime relations and traces back to demo or test setup.',
    }
  }

  return {
    classification: 'UNKNOWN_REQUIRES_MANUAL_DECISION',
    recommendedAction: 'REVIEW_MANUALLY',
    rationale: 'The record could not be safely classified from deterministic source and relation data.',
  }
}

async function ensureDirs() {
  await mkdir(evidenceDir, { recursive: true })
}

async function writeJson(fileName: string, value: unknown) {
  await ensureDirs()
  const filePath = path.join(evidenceDir, fileName)
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  return filePath
}

async function buildInventory() {
  const [
    departments,
    subjects,
    languages,
    groups,
    years,
    semesters,
    degreeLevels,
    programs,
    sessions,
    departmentLanguages,
    programYears,
    programSemesters,
    programSubjects,
    offerings,
  ] = await Promise.all([
    prisma.department.findMany({
      orderBy: { code: 'asc' },
      include: {
        subjects: { select: { id: true } },
        academicPrograms: { select: { id: true } },
        academicOfferings: { select: { id: true } },
        examScheduleItems: { select: { id: true } },
        examCalendars: { select: { id: true } },
        examScheduleSessions: { select: { id: true } },
        teachers: { select: { id: true } },
        students: { select: { id: true } },
        enrollments: { select: { id: true } },
      },
    }),
    prisma.subject.findMany({
      orderBy: { code: 'asc' },
      include: {
        academicOfferings: { select: { id: true } },
        exams: { select: { id: true } },
        courseworkPublications: { select: { id: true } },
        studentSubjects: { select: { id: true } },
        programSubjects: { select: { id: true } },
      },
    }),
    prisma.language.findMany({
      orderBy: { code: 'asc' },
      include: {
        academicOfferings: { select: { id: true } },
        academicGroups: { select: { id: true } },
        departmentLanguages: { select: { id: true } },
        exams: { select: { id: true } },
        courseworkPublications: { select: { id: true } },
        enrollments: { select: { id: true } },
      },
    }),
    prisma.group.findMany({
      orderBy: { code: 'asc' },
      include: {
        academicOfferings: { select: { id: true } },
        exams: { select: { id: true } },
        courseworkPublications: { select: { id: true } },
        enrollments: { select: { id: true } },
        department: { select: { id: true } },
        program: { select: { id: true } },
        language: { select: { id: true } },
        academicSession: { select: { id: true } },
        academicYear: { select: { id: true } },
      },
    }),
    prisma.academicYear.findMany({
      orderBy: { year: 'asc' },
      include: {
        groups: { select: { id: true } },
        exams: { select: { id: true } },
        courseworkPublications: { select: { id: true } },
        enrollments: { select: { id: true } },
      },
    }),
    prisma.semester.findMany({
      orderBy: { number: 'asc' },
      include: {
        academicOfferings: { select: { id: true } },
        programSemesters: { select: { id: true } },
        programSubjects: { select: { id: true } },
        exams: { select: { id: true } },
        courseworkPublications: { select: { id: true } },
        enrollments: { select: { id: true } },
      },
    }),
    prisma.degreeLevel.findMany({
      orderBy: { code: 'asc' },
      include: {
        programs: { select: { id: true } },
      },
    }),
    prisma.academicProgram.findMany({
      orderBy: { code: 'asc' },
      include: {
        groups: { select: { id: true } },
        programYears: { select: { id: true } },
        programSemesters: { select: { id: true } },
        programSubjects: { select: { id: true } },
        academicOfferings: { select: { id: true } },
        enrollments: { select: { id: true } },
        degreeLevel: { select: { id: true } },
        department: { select: { id: true } },
      },
    }),
    prisma.academicSession.findMany({
      orderBy: { code: 'asc' },
      include: {
        groups: { select: { id: true } },
        academicOfferings: { select: { id: true } },
        enrollments: { select: { id: true } },
        academicCalendars: { select: { id: true } },
        schedulingSessions: { select: { id: true } },
      },
    }),
    prisma.departmentLanguage.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        department: { select: { code: true, name: true } },
        language: { select: { code: true, name: true } },
        groups: { select: { id: true } },
        academicOfferings: { select: { id: true } },
        enrollments: { select: { id: true } },
      },
    }),
    prisma.programYear.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        program: { select: { code: true, name: true } },
        groups: { select: { id: true } },
        academicOfferings: { select: { id: true } },
        enrollments: { select: { id: true } },
        programSemesters: { select: { id: true } },
        programSubjects: { select: { id: true } },
      },
    }),
    prisma.programSemester.findMany({
      orderBy: { semesterNumber: 'asc' },
      include: {
        program: { select: { code: true, name: true } },
        semester: { select: { number: true, name: true } },
        groups: { select: { id: true } },
        academicOfferings: { select: { id: true } },
        enrollments: { select: { id: true } },
        programSubjects: { select: { id: true } },
      },
    }),
    prisma.programSubject.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        program: { select: { code: true, name: true } },
        programYear: { select: { code: true, name: true } },
        semester: { select: { number: true, name: true } },
        subject: { select: { code: true, name: true } },
        academicOfferings: { select: { id: true } },
      },
    }),
    prisma.academicOffering.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        department: { select: { code: true } },
        subject: { select: { code: true } },
        language: { select: { code: true } },
        group: { select: { code: true } },
        academicSession: { select: { code: true } },
        program: { select: { code: true } },
        exams: { select: { id: true } },
        courseworkPublications: { select: { id: true } },
        teacherAssignments: { select: { id: true } },
        teachingAssignments: { select: { id: true } },
        scheduledExamItems: { select: { id: true } },
        studentSubjects: { select: { id: true } },
        questions: { select: { id: true } },
      },
    }),
  ])

  const inventory: InventoryRecord[] = []
  const pushInventoryRecord = (base: InventoryRecordBase) => {
    inventory.push({ ...base, ...classifyRecord(base) })
  }

  for (const item of departments) {
    const base = {
      model: 'Department',
      recordId: item.id,
      name: item.name,
      code: item.code,
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('Department', item.code, item.name),
      relations: {
        subjects: item.subjects.length,
        programs: item.academicPrograms.length,
        academicOfferings: item.academicOfferings.length,
        scheduledExamItems: item.examScheduleItems.length,
        academicCalendars: item.examCalendars.length,
        schedulingSessions: item.examScheduleSessions.length,
        teachers: item.teachers.length,
        students: item.students.length,
        enrollments: item.enrollments.length,
      },
    }
    pushInventoryRecord(base)
  }

  for (const item of subjects) {
    const base = {
      model: 'Subject',
      recordId: item.id,
      name: item.name,
      code: item.code,
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('Subject', item.code, item.name),
      relations: {
        academicOfferings: item.academicOfferings.length,
        exams: item.exams.length,
        courseworkPublications: item.courseworkPublications.length,
        studentSubjects: item.studentSubjects.length,
        programSubjects: item.programSubjects.length,
      },
    }
    pushInventoryRecord(base)
  }

  for (const item of languages) {
    const base = {
      model: 'Language',
      recordId: item.id,
      name: item.name,
      code: item.code,
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('Language', item.code, item.name),
      relations: {
        academicOfferings: item.academicOfferings.length,
        groups: item.academicGroups.length,
        departmentLanguages: item.departmentLanguages.length,
        exams: item.exams.length,
        courseworkPublications: item.courseworkPublications.length,
        enrollments: item.enrollments.length,
      },
    }
    pushInventoryRecord(base)
  }

  for (const item of groups) {
    const base = {
      model: 'Group',
      recordId: item.id,
      name: item.name,
      code: item.code,
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('Group', item.code, item.name),
      relations: {
        academicOfferings: item.academicOfferings.length,
        exams: item.exams.length,
        courseworkPublications: item.courseworkPublications.length,
        enrollments: item.enrollments.length,
        department: item.department ? 1 : 0,
        program: item.program ? 1 : 0,
        language: item.language ? 1 : 0,
        session: item.academicSession ? 1 : 0,
        academicYear: item.academicYear ? 1 : 0,
      },
    }
    pushInventoryRecord(base)
  }

  for (const item of years) {
    const base = {
      model: 'AcademicYear',
      recordId: item.id,
      name: item.name,
      code: String(item.year),
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('AcademicYear', null, item.name),
      relations: {
        groups: item.groups.length,
        exams: item.exams.length,
        courseworkPublications: item.courseworkPublications.length,
        enrollments: item.enrollments.length,
      },
    }
    pushInventoryRecord(base)
  }

  for (const item of semesters) {
    const base = {
      model: 'Semester',
      recordId: item.id,
      name: item.name,
      code: String(item.number),
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('Semester', null, item.name),
      relations: {
        academicOfferings: item.academicOfferings.length,
        programSemesters: item.programSemesters.length,
        programSubjects: item.programSubjects.length,
        exams: item.exams.length,
        courseworkPublications: item.courseworkPublications.length,
        enrollments: item.enrollments.length,
      },
    }
    pushInventoryRecord(base)
  }

  for (const item of degreeLevels) {
    const base = {
      model: 'DegreeLevel',
      recordId: item.id,
      name: item.name,
      code: item.code,
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('DegreeLevel', item.code, item.name),
      relations: {
        programs: item.programs.length,
      },
    }
    pushInventoryRecord(base)
  }

  for (const item of programs) {
    const base = {
      model: 'AcademicProgram',
      recordId: item.id,
      name: item.name,
      code: item.code,
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('AcademicProgram', item.code, item.name),
      relations: {
        groups: item.groups.length,
        programYears: item.programYears.length,
        programSemesters: item.programSemesters.length,
        programSubjects: item.programSubjects.length,
        academicOfferings: item.academicOfferings.length,
        enrollments: item.enrollments.length,
        degreeLevel: item.degreeLevel ? 1 : 0,
        department: item.department ? 1 : 0,
      },
    }
    pushInventoryRecord(base)
  }

  for (const item of sessions) {
    const base = {
      model: 'AcademicSession',
      recordId: item.id,
      name: item.name,
      code: item.code,
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('AcademicSession', item.code, item.name),
      relations: {
        groups: item.groups.length,
        academicOfferings: item.academicOfferings.length,
        enrollments: item.enrollments.length,
        academicCalendars: item.academicCalendars.length,
        schedulingSessions: item.schedulingSessions.length,
      },
    }
    pushInventoryRecord(base)
  }

  for (const item of departmentLanguages) {
    const name = `${item.department.code}-${item.language.code}`
    const base = {
      model: 'DepartmentLanguage',
      recordId: item.id,
      name,
      code: name,
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('DepartmentLanguage', name, name),
      relations: {
        groups: item.groups.length,
        academicOfferings: item.academicOfferings.length,
        enrollments: item.enrollments.length,
        department: 1,
        language: 1,
      },
    }
    pushInventoryRecord(base)
  }

  for (const item of programYears) {
    const code = item.code
    const base = {
      model: 'ProgramYear',
      recordId: item.id,
      name: item.name,
      code,
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('ProgramYear', code, item.name),
      relations: {
        groups: item.groups.length,
        academicOfferings: item.academicOfferings.length,
        enrollments: item.enrollments.length,
        programSemesters: item.programSemesters.length,
        programSubjects: item.programSubjects.length,
        program: 1,
      },
    }
    pushInventoryRecord(base)
  }

  for (const item of programSemesters) {
    const code = `${item.program.code}-S${item.semesterNumber}`
    const base = {
      model: 'ProgramSemester',
      recordId: item.id,
      name: `${item.program.name} Semester ${item.semesterNumber}`,
      code,
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('ProgramSemester', code, code),
      relations: {
        groups: item.groups.length,
        academicOfferings: item.academicOfferings.length,
        enrollments: item.enrollments.length,
        programSubjects: item.programSubjects.length,
        program: 1,
        semester: 1,
      },
    }
    pushInventoryRecord(base)
  }

  for (const item of programSubjects) {
    const code = `${item.program.code}:${item.subject.code}`
    const base = {
      model: 'ProgramSubject',
      recordId: item.id,
      name: `${item.program.name} / ${item.subject.name}`,
      code,
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('ProgramSubject', code, code),
      relations: {
        academicOfferings: item.academicOfferings.length,
        program: 1,
        programYear: 1,
        semester: 1,
        subject: 1,
      },
    }
    pushInventoryRecord(base)
  }

  for (const item of offerings) {
    const code = `${item.program.code}:${item.subject.code}:${item.group.code}:${item.language.code}`
    const base = {
      model: 'AcademicOffering',
      recordId: item.id,
      name: code,
      code,
      createdAt: item.createdAt.toISOString(),
      createdSource: getSourceTag('AcademicOffering', code, code),
      relations: {
        exams: item.exams.length,
        courseworkPublications: item.courseworkPublications.length,
        teacherAssignments: item.teacherAssignments.length,
        teachingAssignments: item.teachingAssignments.length,
        scheduledExamItems: item.scheduledExamItems.length,
        studentSubjects: item.studentSubjects.length,
        questions: item.questions.length,
        department: 1,
        subject: 1,
        language: 1,
        group: 1,
        session: 1,
        program: 1,
      },
    }
    pushInventoryRecord(base)
  }

  return inventory
}

async function applyCleanup(inventory: InventoryRecord[]) {
  const byModel = (model: string) =>
    inventory
      .filter((item) => item.model === model && item.classification === 'DEMO_DATA' && item.recommendedAction === 'REMOVE_FROM_PRODUCTION')
      .map((item) => item.recordId)

  const ids = {
    offerings: byModel('AcademicOffering'),
    programSubjects: byModel('ProgramSubject'),
    programSemesters: byModel('ProgramSemester'),
    programYears: byModel('ProgramYear'),
    departmentLanguages: byModel('DepartmentLanguage'),
    groups: byModel('Group'),
    sessions: byModel('AcademicSession'),
    programs: byModel('AcademicProgram'),
    degreeLevels: byModel('DegreeLevel'),
    subjects: byModel('Subject'),
    departments: byModel('Department'),
    languages: byModel('Language'),
    years: byModel('AcademicYear'),
    semesters: byModel('Semester'),
  }

  if (ids.offerings.length > 0) {
    await prisma.academicOffering.deleteMany({ where: { id: { in: ids.offerings } } })
  }
  if (ids.programSubjects.length > 0) {
    await prisma.programSubject.deleteMany({ where: { id: { in: ids.programSubjects } } })
  }
  if (ids.programSemesters.length > 0) {
    await prisma.programSemester.deleteMany({ where: { id: { in: ids.programSemesters } } })
  }
  if (ids.programYears.length > 0) {
    await prisma.programYear.deleteMany({ where: { id: { in: ids.programYears } } })
  }
  if (ids.departmentLanguages.length > 0) {
    await prisma.departmentLanguage.deleteMany({ where: { id: { in: ids.departmentLanguages } } })
  }
  if (ids.groups.length > 0) {
    await prisma.group.deleteMany({ where: { id: { in: ids.groups } } })
  }
  if (ids.sessions.length > 0) {
    await prisma.academicSession.deleteMany({ where: { id: { in: ids.sessions } } })
  }
  if (ids.programs.length > 0) {
    await prisma.academicProgram.deleteMany({ where: { id: { in: ids.programs } } })
  }
  if (ids.degreeLevels.length > 0) {
    await prisma.degreeLevel.deleteMany({ where: { id: { in: ids.degreeLevels } } })
  }
  if (ids.subjects.length > 0) {
    await prisma.subject.deleteMany({ where: { id: { in: ids.subjects } } })
  }
  if (ids.departments.length > 0) {
    await prisma.department.deleteMany({ where: { id: { in: ids.departments } } })
  }
  if (ids.languages.length > 0) {
    await prisma.language.deleteMany({ where: { id: { in: ids.languages } } })
  }
  if (ids.years.length > 0) {
    await prisma.academicYear.deleteMany({ where: { id: { in: ids.years } } })
  }
  if (ids.semesters.length > 0) {
    await prisma.semester.deleteMany({ where: { id: { in: ids.semesters } } })
  }

  return ids
}

async function main() {
  const mode = parseMode()
  assertApplyAllowed(mode)

  const inventory = await buildInventory()
  const inventoryPath = await writeJson('academic-cleanup-inventory.json', {
    generatedAt: new Date().toISOString(),
    mode,
    records: inventory,
  })

  const summaryBefore = {
    totalRecords: inventory.length,
    byClassification: {
      realRequired: inventory.filter((item) => item.classification === 'REAL_REQUIRED_REFERENCE_DATA').length,
      systemDefault: inventory.filter((item) => item.classification === 'SYSTEM_DEFAULT').length,
      demoData: inventory.filter((item) => item.classification === 'DEMO_DATA').length,
      unknown: inventory.filter((item) => item.classification === 'UNKNOWN_REQUIRES_MANUAL_DECISION').length,
    },
  }

  if (mode === 'dry-run') {
    const dryRunPath = await writeJson('academic-cleanup-dry-run-summary.json', {
      generatedAt: new Date().toISOString(),
      mode,
      inventoryPath: path.relative(rootDir, inventoryPath).replace(/\\/g, '/'),
      summaryBefore,
    })

    console.log(
      JSON.stringify(
        {
          mode,
          summaryBefore,
          inventoryPath,
          summaryPath: dryRunPath,
        },
        null,
        2
      )
    )
    return
  }

  const deleted = await applyCleanup(inventory)
  const remainingInventory = await buildInventory()
  const applyPath = await writeJson('academic-cleanup-apply-summary.json', {
    generatedAt: new Date().toISOString(),
    mode,
    deleted,
    summaryBefore,
    summaryAfter: {
      totalRecords: remainingInventory.length,
      byClassification: {
        realRequired: remainingInventory.filter((item) => item.classification === 'REAL_REQUIRED_REFERENCE_DATA').length,
        systemDefault: remainingInventory.filter((item) => item.classification === 'SYSTEM_DEFAULT').length,
        demoData: remainingInventory.filter((item) => item.classification === 'DEMO_DATA').length,
        unknown: remainingInventory.filter((item) => item.classification === 'UNKNOWN_REQUIRES_MANUAL_DECISION').length,
      },
    },
  })

  console.log(
    JSON.stringify(
      {
        mode,
        deleted,
        summaryBefore,
        remainingDemoRecords: remainingInventory.filter((item) => item.classification === 'DEMO_DATA').length,
        remainingUnknownRecords: remainingInventory.filter((item) => item.classification === 'UNKNOWN_REQUIRES_MANUAL_DECISION').length,
        inventoryPath,
        summaryPath: applyPath,
      },
      null,
      2
    )
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
