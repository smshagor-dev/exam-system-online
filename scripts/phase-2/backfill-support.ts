import type { AcademicOffering, AcademicYear, Group, PrismaClient, StudentProfile, StudentSubject, TeacherAssignment } from '@prisma/client'
import { readFile } from 'fs/promises'
import path from 'path'

export const resolutionCategories = [
  'SAFE_EXACT_MATCH',
  'SAFE_SINGLE_CANDIDATE',
  'AMBIGUOUS_MULTIPLE_CANDIDATES',
  'MISSING_PROGRAM_CONTEXT',
  'MISSING_GROUP_CONTEXT',
  'MISSING_LANGUAGE_MAPPING',
  'MISSING_CURRICULUM_MAPPING',
  'INVALID_LEGACY_SCOPE',
  'ORPHAN_REFERENCE',
  'MANUAL_DECISION_REQUIRED',
] as const

export type ResolutionCategory = (typeof resolutionCategories)[number]

export type AcceptedUnresolvedDecision = {
  classification: Exclude<ResolutionCategory, 'SAFE_EXACT_MATCH' | 'SAFE_SINGLE_CANDIDATE'>
  reason: string
  safeBecause: string
  legacyBehavior: string
  futurePhase: string
  approvedBy?: string
  recommendedAction?: string
}

type RecordInstructions = {
  map?: Record<string, string>
  accept?: Record<string, AcceptedUnresolvedDecision>
}

export type ManualMappingFile = {
  teacherAssignments?: RecordInstructions
  studentSubjects?: RecordInstructions
}

export type TeacherAssignmentWithRelations = TeacherAssignment & {
  department: { id: string; name: string; code: string }
  subject: { id: string; name: string; code: string; departmentId: string }
  language: { id: string; name: string; code: string }
  group: Group
  academicYear: AcademicYear
  teacher: {
    id: string
    departmentId: string
    user: { name: string; email: string }
  }
}

export type StudentSubjectWithRelations = StudentSubject & {
  subject: { id: string; name: string; code: string; departmentId: string }
  language: { id: string; name: string; code: string }
  group: Group
  academicYear: AcademicYear
  student: StudentProfile & {
    department: { id: string; name: string; code: string }
    user: { name: string; email: string }
  }
}

export type AcademicOfferingWithRelations = AcademicOffering & {
  group: Group
  program: { id: string; name: string; code: string; degreeLevelId: string; departmentId: string }
  academicSession: { id: string; name: string; code: string; isCurrent: boolean }
  programYear: { id: string; yearNumber: number; name: string; code: string }
  semester: { id: string; number: number; name: string }
  subject: { id: string; name: string; code: string; departmentId: string }
  language: { id: string; name: string; code: string }
  department: { id: string; name: string; code: string }
}

export type ResolutionResult = {
  recordType: 'teacherAssignments' | 'studentSubjects'
  recordId: string
  classification: ResolutionCategory
  resolutionStatus: 'MAPPED' | 'EXPLICITLY_ACCEPTED_UNRESOLVED' | 'UNRESOLVED'
  reason: string
  recommendedAction: string
  candidateOfferings: AcademicOfferingWithRelations[]
  selectedOfferingId: string | null
  acceptedDecision?: AcceptedUnresolvedDecision
}

export function getManualMapPath() {
  return path.join(process.cwd(), 'scripts', 'phase-2', 'manual-academic-offering-map.json')
}

export async function loadManualMappingFile() {
  try {
    const raw = await readFile(getManualMapPath(), 'utf8')
    const parsed = JSON.parse(raw) as ManualMappingFile
    return {
      teacherAssignments: {
        map: parsed.teacherAssignments?.map ?? {},
        accept: parsed.teacherAssignments?.accept ?? {},
      },
      studentSubjects: {
        map: parsed.studentSubjects?.map ?? {},
        accept: parsed.studentSubjects?.accept ?? {},
      },
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        teacherAssignments: { map: {}, accept: {} },
        studentSubjects: { map: {}, accept: {} },
      }
    }

    throw error
  }
}

export function getDatabaseName(databaseUrl: string | undefined) {
  if (!databaseUrl) return 'unknown'
  const withoutQuery = databaseUrl.split('?')[0]
  return withoutQuery.slice(withoutQuery.lastIndexOf('/') + 1) || 'unknown'
}

function isOfferingLegacyCompatible(
  legacy: {
    departmentId?: string | null
    subjectId: string
    languageId: string
    groupId: string
    academicYearYear: number
    semesterId: string
  },
  offering: AcademicOfferingWithRelations
) {
  return (
    offering.subjectId === legacy.subjectId &&
    offering.languageId === legacy.languageId &&
    offering.groupId === legacy.groupId &&
    offering.semesterId === legacy.semesterId &&
    offering.programYear.yearNumber === legacy.academicYearYear &&
    (!legacy.departmentId || offering.departmentId === legacy.departmentId)
  )
}

export function findCandidateOfferings(
  legacy: {
    departmentId?: string | null
    subjectId: string
    languageId: string
    groupId: string
    academicYearYear: number
    semesterId: string
  },
  offerings: AcademicOfferingWithRelations[]
) {
  return offerings.filter((offering) => isOfferingLegacyCompatible(legacy, offering))
}

function inferFailureCategory(group: Group, candidateCount: number): ResolutionCategory {
  if (!group.departmentId || !group.programId || !group.languageId || !group.academicSessionId || !group.programYearId) {
    return 'MISSING_GROUP_CONTEXT'
  }
  if (!group.programId) {
    return 'MISSING_PROGRAM_CONTEXT'
  }
  if (!group.languageId) {
    return 'MISSING_LANGUAGE_MAPPING'
  }
  if (candidateCount > 1) {
    return 'AMBIGUOUS_MULTIPLE_CANDIDATES'
  }
  return 'MISSING_CURRICULUM_MAPPING'
}

export function resolveTeacherAssignment(
  record: TeacherAssignmentWithRelations,
  offerings: AcademicOfferingWithRelations[],
  instructions: Awaited<ReturnType<typeof loadManualMappingFile>>
): ResolutionResult {
  const acceptedDecision = instructions.teacherAssignments.accept[record.id]
  const manualOfferingId = instructions.teacherAssignments.map[record.id]
  const candidateOfferings = findCandidateOfferings(
    {
      departmentId: record.departmentId,
      subjectId: record.subjectId,
      languageId: record.languageId,
      groupId: record.groupId,
      academicYearYear: record.academicYear.year,
      semesterId: record.semesterId,
    },
    offerings
  )

  if (record.academicOfferingId) {
    const existingOffering = offerings.find((offering) => offering.id === record.academicOfferingId)
    if (!existingOffering) {
      return {
        recordType: 'teacherAssignments',
        recordId: record.id,
        classification: 'ORPHAN_REFERENCE',
        resolutionStatus: acceptedDecision ? 'EXPLICITLY_ACCEPTED_UNRESOLVED' : 'UNRESOLVED',
        reason: 'The record references an academic offering that no longer exists.',
        recommendedAction: acceptedDecision ? acceptedDecision.recommendedAction ?? acceptedDecision.futurePhase : 'Repair or remove the orphan academicOfferingId reference.',
        candidateOfferings,
        selectedOfferingId: null,
        acceptedDecision,
      }
    }

    if (!isOfferingLegacyCompatible({
      departmentId: record.departmentId,
      subjectId: record.subjectId,
      languageId: record.languageId,
      groupId: record.groupId,
      academicYearYear: record.academicYear.year,
      semesterId: record.semesterId,
    }, existingOffering)) {
      return {
        recordType: 'teacherAssignments',
        recordId: record.id,
        classification: 'INVALID_LEGACY_SCOPE',
        resolutionStatus: acceptedDecision ? 'EXPLICITLY_ACCEPTED_UNRESOLVED' : 'UNRESOLVED',
        reason: 'The stored academic offering conflicts with the legacy academic scope tuple.',
        recommendedAction: acceptedDecision ? acceptedDecision.recommendedAction ?? acceptedDecision.futurePhase : 'Inspect and correct the conflicting scope fields before using this mapping.',
        candidateOfferings,
        selectedOfferingId: null,
        acceptedDecision,
      }
    }
  }

  if (manualOfferingId) {
    return {
      recordType: 'teacherAssignments',
      recordId: record.id,
      classification: 'SAFE_SINGLE_CANDIDATE',
      resolutionStatus: 'MAPPED',
      reason: 'A validated manual mapping is configured for this record.',
      recommendedAction: 'Apply the validated manual mapping.',
      candidateOfferings,
      selectedOfferingId: manualOfferingId,
    }
  }

  if (candidateOfferings.length === 1) {
    return {
      recordType: 'teacherAssignments',
      recordId: record.id,
      classification: 'SAFE_SINGLE_CANDIDATE',
      resolutionStatus: 'MAPPED',
      reason: 'Exactly one academic offering matches the complete legacy academic scope tuple.',
      recommendedAction: 'Auto-map to the single compatible offering.',
      candidateOfferings,
      selectedOfferingId: candidateOfferings[0].id,
    }
  }

  const classification = inferFailureCategory(record.group, candidateOfferings.length)
  return {
    recordType: 'teacherAssignments',
    recordId: record.id,
    classification,
    resolutionStatus: acceptedDecision ? 'EXPLICITLY_ACCEPTED_UNRESOLVED' : 'UNRESOLVED',
    reason:
      candidateOfferings.length > 1
        ? 'Multiple academic offerings match this legacy tuple, so the record cannot be mapped safely.'
        : 'No academic offering can be proven from the legacy tuple and current normalized group/program context.',
    recommendedAction: acceptedDecision ? acceptedDecision.recommendedAction ?? acceptedDecision.futurePhase : 'Keep legacy fallback active until historical curriculum or group context can be reconstructed safely.',
    candidateOfferings,
    selectedOfferingId: null,
    acceptedDecision,
  }
}

export function resolveStudentSubject(
  record: StudentSubjectWithRelations,
  offerings: AcademicOfferingWithRelations[],
  instructions: Awaited<ReturnType<typeof loadManualMappingFile>>
): ResolutionResult {
  const acceptedDecision = instructions.studentSubjects.accept[record.id]
  const manualOfferingId = instructions.studentSubjects.map[record.id]
  const candidateOfferings = findCandidateOfferings(
    {
      departmentId: record.student.departmentId,
      subjectId: record.subjectId,
      languageId: record.languageId,
      groupId: record.groupId,
      academicYearYear: record.academicYear.year,
      semesterId: record.semesterId,
    },
    offerings
  )

  if (record.academicOfferingId) {
    const existingOffering = offerings.find((offering) => offering.id === record.academicOfferingId)
    if (!existingOffering) {
      return {
        recordType: 'studentSubjects',
        recordId: record.id,
        classification: 'ORPHAN_REFERENCE',
        resolutionStatus: acceptedDecision ? 'EXPLICITLY_ACCEPTED_UNRESOLVED' : 'UNRESOLVED',
        reason: 'The record references an academic offering that no longer exists.',
        recommendedAction: acceptedDecision ? acceptedDecision.recommendedAction ?? acceptedDecision.futurePhase : 'Repair or remove the orphan academicOfferingId reference.',
        candidateOfferings,
        selectedOfferingId: null,
        acceptedDecision,
      }
    }
  }

  if (manualOfferingId) {
    return {
      recordType: 'studentSubjects',
      recordId: record.id,
      classification: 'SAFE_SINGLE_CANDIDATE',
      resolutionStatus: 'MAPPED',
      reason: 'A validated manual mapping is configured for this record.',
      recommendedAction: 'Apply the validated manual mapping.',
      candidateOfferings,
      selectedOfferingId: manualOfferingId,
    }
  }

  if (candidateOfferings.length === 1) {
    return {
      recordType: 'studentSubjects',
      recordId: record.id,
      classification: 'SAFE_SINGLE_CANDIDATE',
      resolutionStatus: 'MAPPED',
      reason: 'Exactly one academic offering matches the complete legacy academic scope tuple.',
      recommendedAction: 'Auto-map to the single compatible offering.',
      candidateOfferings,
      selectedOfferingId: candidateOfferings[0].id,
    }
  }

  const classification = inferFailureCategory(record.group, candidateOfferings.length)
  return {
    recordType: 'studentSubjects',
    recordId: record.id,
    classification,
    resolutionStatus: acceptedDecision ? 'EXPLICITLY_ACCEPTED_UNRESOLVED' : 'UNRESOLVED',
    reason:
      candidateOfferings.length > 1
        ? 'Multiple academic offerings match this legacy tuple, so the record cannot be mapped safely.'
        : 'No academic offering can be proven from the student subject tuple and current normalized group/program context.',
    recommendedAction: acceptedDecision ? acceptedDecision.recommendedAction ?? acceptedDecision.futurePhase : 'Keep legacy fallback active until historical enrollment or curriculum evidence is available.',
    candidateOfferings,
    selectedOfferingId: null,
    acceptedDecision,
  }
}

export async function validateManualMappings(
  _prisma: PrismaClient,
  resolutions: ResolutionResult[],
  offerings: AcademicOfferingWithRelations[],
  manualMappings: Awaited<ReturnType<typeof loadManualMappingFile>>
) {
  for (const resolution of resolutions) {
    const targetId =
      resolution.recordType === 'teacherAssignments'
        ? manualMappings.teacherAssignments.map[resolution.recordId]
        : manualMappings.studentSubjects.map[resolution.recordId]

    if (!targetId) continue

    const offering = offerings.find((item) => item.id === targetId)
    if (!offering) {
      throw new Error(`Manual mapping target ${targetId} does not exist for ${resolution.recordType}/${resolution.recordId}`)
    }

    if (!resolution.candidateOfferings.some((candidate) => candidate.id === targetId)) {
      throw new Error(`Manual mapping target ${targetId} is incompatible with ${resolution.recordType}/${resolution.recordId}`)
    }
  }
}

export function buildCandidateSummary(candidate: AcademicOfferingWithRelations) {
  return `${candidate.id} | ${candidate.academicSession.code} | ${candidate.program.code} | ${candidate.programYear.name} | ${candidate.language.code} | ${candidate.group.code} | ${candidate.subject.code}`
}
