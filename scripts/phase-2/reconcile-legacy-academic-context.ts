import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function ensureLegacyGroupContext(input: {
  code: string
  departmentCode: string
  programCode: string
  languageCode: string
  programYearNumber: number
  semesterNumber: number
}) {
  const group = await prisma.group.findFirstOrThrow({
    where: { code: input.code },
  })
  const department = await prisma.department.findFirstOrThrow({
    where: { code: input.departmentCode },
  })
  const program = await prisma.academicProgram.findFirstOrThrow({
    where: { code: input.programCode, departmentId: department.id, isActive: true },
  })
  const session = await prisma.academicSession.findFirstOrThrow({
    where: { isCurrent: true, isActive: true },
  })
  const academicYear = await prisma.academicYear.findFirstOrThrow({
    where: { year: input.programYearNumber, isActive: true },
  })
  const programYear = await prisma.programYear.findFirstOrThrow({
    where: {
      programId: program.id,
      yearNumber: input.programYearNumber,
      isActive: true,
    },
  })
  const semester = await prisma.semester.findFirstOrThrow({
    where: { number: input.semesterNumber, isActive: true },
  })
  const programSemester = await prisma.programSemester.findFirst({
    where: {
      programId: program.id,
      programYearId: programYear.id,
      semesterId: semester.id,
      isActive: true,
    },
  })
  const language = await prisma.language.findFirstOrThrow({
    where: { code: input.languageCode },
  })
  const departmentLanguage = await prisma.departmentLanguage.findFirstOrThrow({
    where: {
      departmentId: department.id,
      languageId: language.id,
      isActive: true,
    },
  })

  await prisma.group.update({
    where: { id: group.id },
    data: {
      departmentId: department.id,
      programId: program.id,
      academicSessionId: session.id,
      programYearId: programYear.id,
      currentProgramSemesterId: programSemester?.id ?? null,
      academicYearId: academicYear.id,
      languageId: language.id,
      departmentLanguageId: departmentLanguage.id,
      isActive: true,
    },
  })

  return {
    groupId: group.id,
    departmentId: department.id,
    programId: program.id,
    academicSessionId: session.id,
    programYearId: programYear.id,
    semesterId: semester.id,
    languageId: language.id,
  }
}

async function ensureOffering(input: {
  groupId: string
  departmentId: string
  programId: string
  academicSessionId: string
  programYearId: string
  semesterId: string
  languageId: string
  subjectCode: string
}) {
  const subject = await prisma.subject.findFirstOrThrow({
    where: { code: input.subjectCode, departmentId: input.departmentId, isActive: true },
  })

  await prisma.academicOffering.upsert({
    where: {
      academicSessionId_programId_languageId_programYearId_semesterId_groupId_subjectId: {
        academicSessionId: input.academicSessionId,
        programId: input.programId,
        languageId: input.languageId,
        programYearId: input.programYearId,
        semesterId: input.semesterId,
        groupId: input.groupId,
        subjectId: subject.id,
      },
    },
    update: {
      departmentId: input.departmentId,
      status: 'ACTIVE',
      isActive: true,
    },
    create: {
      academicSessionId: input.academicSessionId,
      departmentId: input.departmentId,
      programId: input.programId,
      languageId: input.languageId,
      programYearId: input.programYearId,
      semesterId: input.semesterId,
      groupId: input.groupId,
      subjectId: subject.id,
      status: 'ACTIVE',
      isActive: true,
    },
  })
}

async function main() {
  const grpA = await ensureLegacyGroupContext({
    code: 'GRP-A',
    departmentCode: 'CSE',
    programCode: 'BSC-CS',
    languageCode: 'EN',
    programYearNumber: 2,
    semesterNumber: 1,
  })

  const grpB = await ensureLegacyGroupContext({
    code: 'GRP-B',
    departmentCode: 'CSE',
    programCode: 'BSC-CS',
    languageCode: 'EN',
    programYearNumber: 3,
    semesterNumber: 1,
  })

  await ensureOffering({ ...grpA, subjectCode: 'CSE-201' })
  await ensureOffering({ ...grpA, subjectCode: 'CSE-301' })
  await ensureOffering({ ...grpB, subjectCode: 'CSE-401' })

  console.log('Legacy academic context reconciled for GRP-A and GRP-B.')
}

main()
  .catch((error) => {
    console.error('[Phase 2 Legacy Reconcile] Failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
