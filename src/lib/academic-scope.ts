import { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from './prisma'

type DbClient = PrismaClient | Prisma.TransactionClient

export type LegacyAcademicScope = {
  departmentId?: string | null
  subjectId?: string | null
  languageId?: string | null
  groupId?: string | null
  academicYearId?: string | null
  semesterId?: string | null
}

export type AcademicContextInput = {
  academicSessionId: string
  programId: string
  departmentId: string
  languageId: string
  programYearId: string
  semesterId: string
  groupId: string
  subjectId: string
  departmentLanguageId?: string | null
  programSemesterId?: string | null
  programSubjectId?: string | null
}

export const academicOfferingInclude = {
  academicSession: true,
  program: { include: { degreeLevel: true, department: true } },
  department: true,
  departmentLanguage: { include: { language: true } },
  language: true,
  programYear: true,
  semester: true,
  programSemester: true,
  group: true,
  subject: true,
  programSubject: true,
} satisfies Prisma.AcademicOfferingInclude

function getDb(client?: DbClient) {
  return client ?? prisma
}

export function buildLegacyAcademicScope(input: LegacyAcademicScope) {
  return {
    departmentId: input.departmentId ?? null,
    subjectId: input.subjectId ?? null,
    languageId: input.languageId ?? null,
    groupId: input.groupId ?? null,
    academicYearId: input.academicYearId ?? null,
    semesterId: input.semesterId ?? null,
  }
}

export async function validateDepartmentLanguage(
  input: { departmentId: string; languageId: string; departmentLanguageId?: string | null },
  client?: DbClient
) {
  const db = getDb(client)
  const departmentLanguage = await db.departmentLanguage.findFirst({
    where: {
      departmentId: input.departmentId,
      languageId: input.languageId,
      ...(input.departmentLanguageId ? { id: input.departmentLanguageId } : {}),
      isActive: true,
    },
    include: { department: true, language: true },
  })

  if (!departmentLanguage) {
    throw new Error('Department does not support the selected language')
  }

  return departmentLanguage
}

export async function validateProgramYear(
  input: { programId: string; programYearId: string },
  client?: DbClient
) {
  const db = getDb(client)
  const programYear = await db.programYear.findUnique({
    where: { id: input.programYearId },
    include: { program: true },
  })

  if (!programYear || programYear.programId !== input.programId) {
    throw new Error('Program year does not belong to the selected program')
  }

  if (programYear.yearNumber > programYear.program.durationYears) {
    throw new Error('Program year exceeds the configured program duration')
  }

  return programYear
}

export async function validateProgramSemester(
  input: { programId: string; programYearId: string; semesterId: string; programSemesterId?: string | null },
  client?: DbClient
) {
  const db = getDb(client)
  const programSemester = await db.programSemester.findFirst({
    where: {
      programId: input.programId,
      programYearId: input.programYearId,
      semesterId: input.semesterId,
      ...(input.programSemesterId ? { id: input.programSemesterId } : {}),
      isActive: true,
    },
    include: { programYear: true, semester: true },
  })

  if (!programSemester) {
    throw new Error('Semester is not mapped to the selected program year')
  }

  return programSemester
}

export async function validateProgramSemesterById(
  input: { programId: string; programYearId: string; programSemesterId?: string | null },
  client?: DbClient
) {
  if (!input.programSemesterId) return null

  const db = getDb(client)
  const programSemester = await db.programSemester.findUnique({
    where: { id: input.programSemesterId },
    include: { programYear: true, semester: true },
  })

  if (!programSemester || !programSemester.isActive) {
    throw new Error('Program semester not found')
  }
  if (programSemester.programId !== input.programId) {
    throw new Error('Program semester belongs to a different program')
  }
  if (programSemester.programYearId !== input.programYearId) {
    throw new Error('Program semester belongs to a different program year')
  }

  return programSemester
}

export async function validateGroupContext(
  input: {
    departmentId: string
    programId: string
    languageId: string
    academicSessionId: string
    programYearId: string
    groupId: string
    departmentLanguageId?: string | null
    programSemesterId?: string | null
  },
  client?: DbClient
) {
  const db = getDb(client)
  const group = await db.group.findUnique({
    where: { id: input.groupId },
  })

  if (!group) {
    throw new Error('Group not found')
  }

  if (group.departmentId && group.departmentId !== input.departmentId) {
    throw new Error('Group belongs to a different department')
  }
  if (group.programId && group.programId !== input.programId) {
    throw new Error('Group belongs to a different program')
  }
  if (group.languageId && group.languageId !== input.languageId) {
    throw new Error('Group belongs to a different language')
  }
  if (group.academicSessionId && group.academicSessionId !== input.academicSessionId) {
    throw new Error('Group belongs to a different academic session')
  }
  if (group.programYearId && group.programYearId !== input.programYearId) {
    throw new Error('Group belongs to a different program year')
  }
  if (input.departmentLanguageId && group.departmentLanguageId && group.departmentLanguageId !== input.departmentLanguageId) {
    throw new Error('Group belongs to a different department language')
  }
  if (input.programSemesterId && group.currentProgramSemesterId && group.currentProgramSemesterId !== input.programSemesterId) {
    throw new Error('Group belongs to a different program semester')
  }

  return group
}

export async function validateProgramSubject(
  input: {
    programId: string
    programYearId: string
    semesterId: string
    subjectId: string
    programSubjectId?: string | null
    programSemesterId?: string | null
  },
  client?: DbClient
) {
  const db = getDb(client)
  const programSubject = await db.programSubject.findFirst({
    where: {
      programId: input.programId,
      programYearId: input.programYearId,
      semesterId: input.semesterId,
      subjectId: input.subjectId,
      ...(input.programSubjectId ? { id: input.programSubjectId } : {}),
      ...(input.programSemesterId ? { programSemesterId: input.programSemesterId } : {}),
      isActive: true,
    },
    include: { subject: true, program: true, programYear: true, semester: true },
  })

  if (!programSubject) {
    throw new Error('Subject is not part of the selected program curriculum')
  }

  return programSubject
}

export async function validateAcademicContext(input: AcademicContextInput, client?: DbClient) {
  const db = getDb(client)

  const [session, program] = await Promise.all([
    db.academicSession.findFirst({ where: { id: input.academicSessionId, isActive: true } }),
    db.academicProgram.findFirst({
      where: { id: input.programId, isActive: true },
      include: { degreeLevel: true, department: true },
    }),
  ])

  if (!session) {
    throw new Error('Academic session not found')
  }
  if (!program) {
    throw new Error('Academic program not found')
  }
  if (program.departmentId !== input.departmentId) {
    throw new Error('Program does not belong to the selected department')
  }

  const departmentLanguage = await validateDepartmentLanguage(input, db)
  const programYear = await validateProgramYear(input, db)
  const programSemester = await validateProgramSemester(input, db)
  const group = await validateGroupContext(input, db)
  const programSubject = await validateProgramSubject(input, db)

  return {
    session,
    program,
    departmentLanguage,
    programYear,
    programSemester,
    group,
    programSubject,
  }
}

export async function validateGroupAcademicContext(
  input: {
    departmentId: string
    programId: string
    languageId: string
    academicSessionId: string
    programYearId: string
    academicYearId: string
    departmentLanguageId?: string | null
    currentProgramSemesterId?: string | null
  },
  client?: DbClient
) {
  const db = getDb(client)

  const [session, program, academicYear] = await Promise.all([
    db.academicSession.findFirst({ where: { id: input.academicSessionId, isActive: true } }),
    db.academicProgram.findFirst({
      where: { id: input.programId, isActive: true },
      include: { degreeLevel: true, department: true },
    }),
    db.academicYear.findFirst({ where: { id: input.academicYearId, isActive: true } }),
  ])

  if (!session) {
    throw new Error('Academic session not found')
  }
  if (!program) {
    throw new Error('Academic program not found')
  }
  if (!academicYear) {
    throw new Error('Academic year not found')
  }
  if (program.departmentId !== input.departmentId) {
    throw new Error('Program does not belong to the selected department')
  }

  const departmentLanguage = await validateDepartmentLanguage(input, db)
  const programYear = await validateProgramYear(input, db)
  const currentProgramSemester = await validateProgramSemesterById(
    {
      programId: input.programId,
      programYearId: input.programYearId,
      programSemesterId: input.currentProgramSemesterId,
    },
    db
  )

  if (academicYear.year !== programYear.yearNumber) {
    throw new Error('Academic year does not match the selected program year')
  }

  return {
    session,
    program,
    academicYear,
    departmentLanguage,
    programYear,
    currentProgramSemester,
  }
}

export async function resolveAcademicOfferingScope(
  input: { academicOfferingId?: string | null; legacy?: LegacyAcademicScope | null },
  client?: DbClient
) {
  const db = getDb(client)

  if (input.academicOfferingId) {
    const offering = await db.academicOffering.findUnique({
      where: { id: input.academicOfferingId },
      include: academicOfferingInclude,
    })

    if (!offering) {
      throw new Error('Academic offering not found')
    }

    return {
      source: 'offering' as const,
      offering,
      legacy: buildLegacyAcademicScope({
        departmentId: offering.departmentId,
        subjectId: offering.subjectId,
        languageId: offering.languageId,
        groupId: offering.groupId,
        semesterId: offering.semesterId,
      }),
    }
  }

  return {
    source: 'legacy' as const,
    offering: null,
    legacy: buildLegacyAcademicScope(input.legacy ?? {}),
  }
}
