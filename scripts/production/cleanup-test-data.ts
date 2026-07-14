import { PrismaClient, UserRole } from '@prisma/client/index'
import { mkdir, readdir, rm, stat, writeFile } from 'fs/promises'
import path from 'path'

type CleanupMode = 'dry-run' | 'apply'

type FixtureInventory = {
  generatedAt: string
  fixtureUsers: Array<{ id: string; email: string; role: UserRole; name: string }>
  fixtureTeacherIds: string[]
  fixtureStudentIds: string[]
  fixtureExamIds: string[]
  fixtureExams: Array<{ id: string; title: string }>
  fixtureQuestionIds: string[]
  fixtureTemplateIds: string[]
  fixtureTemplates: Array<{ id: string; title: string }>
  fixturePublicationIds: string[]
  fixturePublications: Array<{ id: string; title: string }>
  fixtureAttemptIds: string[]
  fixtureAttemptAttachmentIds: string[]
  fixtureAttachmentFiles: string[]
  orphanAttachmentFiles: string[]
  orphanAttachmentBytes: number
  fixtureRubricIds: string[]
  fixtureAcademicOfferingIds: string[]
  fixtureTeacherAssignmentIds: string[]
  fixtureTeachingAssignmentIds: string[]
  demoAcademicMetadata: {
    departmentIds: string[]
    subjectIds: string[]
    languageIds: string[]
    groupIds: string[]
    academicYearIds: string[]
    semesterIds: string[]
    degreeLevelIds: string[]
    academicProgramIds: string[]
    academicSessionIds: string[]
    programYearIds: string[]
    programSemesterIds: string[]
    programSubjectIds: string[]
    departmentLanguageIds: string[]
  }
  counts: Record<string, number>
}

const prisma = new PrismaClient()
const WORKDIR = process.cwd()
const RELEASE_DIR = path.join(WORKDIR, 'docs', 'production-release')
const BACKUP_DIR = path.join(RELEASE_DIR, 'backups')
const COURSEWORK_UPLOAD_DIR = path.join(WORKDIR, 'public', 'uploads', 'coursework-enterprise')

const DEMO_DEPARTMENT_CODES = new Set(['CSE', 'EEE', 'BBA'])
const DEMO_SUBJECT_CODES = new Set(['CSE-201', 'CSE-301', 'CSE-401', 'EEE-101', 'BBA-101'])
const DEMO_GROUP_CODES = new Set(['GRP-A', 'GRP-B', 'GRP-C', 'BSC-CS-21E', 'BSC-CS-11B', 'MSC-AI-11E'])
const DEMO_ACADEMIC_YEAR_NAMES = new Set(['Year 1', 'Year 2', 'Year 3', 'Year 4'])
const DEMO_SEMESTER_NAMES = new Set(['Semester 1', 'Semester 2'])
const DEMO_DEGREE_LEVEL_CODES = new Set(['BSC', 'MSC'])
const DEMO_PROGRAM_CODES = new Set(['BSC-CS', 'MSC-AI'])
const DEMO_ACADEMIC_SESSION_CODES = new Set(['2026-2027'])
const DEMO_PROGRAM_YEAR_CODES = new Set(['BSC-Y1', 'BSC-Y2', 'BSC-Y3', 'BSC-Y4', 'MSC-Y1', 'MSC-Y2'])
const DEMO_LANGUAGE_CODES = new Set(['EN', 'BN', 'AR'])
const FIXTURE_UPLOAD_NAME_PATTERN =
  /(fixture|browser-valid|valid-submission|corrupted|below-min|above-max|phase7-test|grace-pass|late-|extension-allowed|percentage-penalty|fixed-penalty|daily-penalty)/i

function parseMode(): CleanupMode {
  if (process.argv.includes('--apply')) {
    return 'apply'
  }

  return 'dry-run'
}

function matchesFixtureUser(email: string) {
  return /^(admin|cse\.admin|eee\.admin|teacher\.[^@]+|alice|bob|charlie|auth\.[^@]+|p5\.[^@]+|p6\.[^@]+|phase8\.[^@]+)@/i.test(
    email
  )
}

function matchesFixtureTitle(title: string | null | undefined) {
  const normalized = String(title || '').trim()
  return /^(P5|P6|Phase\s+[4-9]|Phase\s+10|Data Structures Mid-term Exam)/i.test(normalized)
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

async function listCourseworkUploadFiles() {
  try {
    const entries = await readdir(COURSEWORK_UPLOAD_DIR)
    return entries
  } catch {
    return []
  }
}

async function collectFixtureInventory(): Promise<FixtureInventory> {
  const [
    users,
    teacherProfiles,
    studentProfiles,
    exams,
    questions,
    templates,
    publications,
    attempts,
    attemptAttachments,
    rubrics,
    teacherAssignments,
    teachingAssignments,
    departments,
    subjects,
    languages,
    groups,
    academicYears,
    semesters,
    degreeLevels,
    academicPrograms,
    academicSessions,
    programYears,
    programSemesters,
    programSubjects,
    departmentLanguages,
    uploadFiles,
  ] = await Promise.all([
    prisma.user.findMany({ select: { id: true, email: true, role: true, name: true } }),
    prisma.teacherProfile.findMany({ select: { id: true, userId: true, departmentId: true } }),
    prisma.studentProfile.findMany({ select: { id: true, userId: true, departmentId: true } }),
    prisma.exam.findMany({ select: { id: true, title: true, teacherId: true } }),
    prisma.question.findMany({ select: { id: true, text: true, teacherId: true } }),
    prisma.courseworkTemplate.findMany({
      select: {
        id: true,
        title: true,
        teacherId: true,
        subjectId: true,
        languageId: true,
        groupId: true,
        academicYearId: true,
        semesterId: true,
        academicOfferingId: true,
        rubric: { select: { id: true } },
      },
    }),
    prisma.courseworkPublication.findMany({
      select: { id: true, title: true, teacherId: true, rubricId: true, subjectId: true, languageId: true, groupId: true, academicYearId: true, semesterId: true, academicOfferingId: true, templateId: true },
    }),
    prisma.courseworkAttempt.findMany({ select: { id: true, publicationId: true, studentId: true } }),
    prisma.courseworkAttemptAttachment.findMany({ select: { id: true, attemptId: true, fileUrl: true } }),
    prisma.courseworkRubric.findMany({ select: { id: true, title: true } }),
    prisma.teacherAssignment.findMany({ select: { id: true, teacherId: true, academicOfferingId: true } }),
    prisma.teachingAssignment.findMany({ select: { id: true, teacherId: true, academicOfferingId: true } }),
    prisma.department.findMany({ select: { id: true, code: true } }),
    prisma.subject.findMany({ select: { id: true, code: true } }),
    prisma.language.findMany({ select: { id: true, code: true } }),
    prisma.group.findMany({ select: { id: true, code: true } }),
    prisma.academicYear.findMany({ select: { id: true, name: true } }),
    prisma.semester.findMany({ select: { id: true, name: true } }),
    prisma.degreeLevel.findMany({ select: { id: true, code: true } }),
    prisma.academicProgram.findMany({ select: { id: true, code: true } }),
    prisma.academicSession.findMany({ select: { id: true, code: true } }),
    prisma.programYear.findMany({ select: { id: true, code: true } }),
    prisma.programSemester.findMany({ select: { id: true, programId: true } }),
    prisma.programSubject.findMany({ select: { id: true, subjectId: true } }),
    prisma.departmentLanguage.findMany({ select: { id: true, departmentId: true, languageId: true } }),
    listCourseworkUploadFiles(),
  ])

  const fixtureUsers = users.filter((user) => matchesFixtureUser(user.email))
  const fixtureUserIds = new Set(fixtureUsers.map((user) => user.id))
  const fixtureTeacherIds = teacherProfiles.filter((profile) => fixtureUserIds.has(profile.userId)).map((profile) => profile.id)
  const fixtureStudentIds = studentProfiles.filter((profile) => fixtureUserIds.has(profile.userId)).map((profile) => profile.id)
  const fixtureTeacherIdSet = new Set(fixtureTeacherIds)
  const fixtureStudentIdSet = new Set(fixtureStudentIds)

  const fixtureExamIds = exams
    .filter((exam) => fixtureTeacherIdSet.has(exam.teacherId) || matchesFixtureTitle(exam.title))
    .map((exam) => exam.id)
  const fixtureExamIdSet = new Set(fixtureExamIds)
  const fixtureQuestionIds = questions
    .filter((question) => fixtureTeacherIdSet.has(question.teacherId) || matchesFixtureTitle(question.text))
    .map((question) => question.id)

  const fixtureTemplateIds = templates
    .filter((template) => fixtureTeacherIdSet.has(template.teacherId) || matchesFixtureTitle(template.title))
    .map((template) => template.id)
  const fixtureTemplateIdSet = new Set(fixtureTemplateIds)

  const fixturePublicationIds = publications
    .filter(
      (publication) =>
        fixtureTeacherIdSet.has(publication.teacherId) ||
        fixtureTemplateIdSet.has(publication.templateId) ||
        matchesFixtureTitle(publication.title)
    )
    .map((publication) => publication.id)
  const fixturePublicationIdSet = new Set(fixturePublicationIds)

  const fixtureAttemptIds = attempts
    .filter((attempt) => fixturePublicationIdSet.has(attempt.publicationId) || fixtureStudentIdSet.has(attempt.studentId))
    .map((attempt) => attempt.id)
  const fixtureAttemptIdSet = new Set(fixtureAttemptIds)

  const fixtureAttemptAttachmentIds = attemptAttachments
    .filter((attachment) => fixtureAttemptIdSet.has(attachment.attemptId))
    .map((attachment) => attachment.id)
  const fixtureAttachmentFiles = unique(
    attemptAttachments
      .filter((attachment) => fixtureAttemptIdSet.has(attachment.attemptId))
      .map((attachment) => path.basename(attachment.fileUrl))
  )
  const referencedAttachmentFiles = new Set(attemptAttachments.map((attachment) => path.basename(attachment.fileUrl)))
  const orphanAttachmentFiles = uploadFiles.filter(
    (fileName) => !referencedAttachmentFiles.has(fileName) && FIXTURE_UPLOAD_NAME_PATTERN.test(fileName)
  )
  const orphanAttachmentBytes = (
    await Promise.all(
      orphanAttachmentFiles.map(async (fileName) => {
        try {
          const file = await stat(path.join(COURSEWORK_UPLOAD_DIR, fileName))
          return file.size
        } catch {
          return 0
        }
      })
    )
  ).reduce((sum, value) => sum + value, 0)

  const fixtureRubricIds = unique(
    [
      ...templates
        .filter((template) => fixtureTemplateIdSet.has(template.id))
        .map((template) => template.rubric?.id)
        .filter(Boolean),
      ...publications.filter((publication) => fixturePublicationIdSet.has(publication.id)).map((publication) => publication.rubricId).filter(Boolean),
      ...rubrics.filter((rubric) => matchesFixtureTitle(rubric.title)).map((rubric) => rubric.id),
    ] as string[]
  )

  const fixtureAcademicOfferingIds = unique(
    [
      ...templates.filter((template) => fixtureTemplateIdSet.has(template.id)).map((template) => template.academicOfferingId).filter(Boolean),
      ...publications.filter((publication) => fixturePublicationIdSet.has(publication.id)).map((publication) => publication.academicOfferingId).filter(Boolean),
      ...teacherAssignments.filter((assignment) => fixtureTeacherIdSet.has(assignment.teacherId)).map((assignment) => assignment.academicOfferingId).filter(Boolean),
      ...teachingAssignments.filter((assignment) => fixtureTeacherIdSet.has(assignment.teacherId)).map((assignment) => assignment.academicOfferingId).filter(Boolean),
    ] as string[]
  )

  const demoAcademicMetadata = {
    departmentIds: departments.filter((item) => DEMO_DEPARTMENT_CODES.has(item.code)).map((item) => item.id),
    subjectIds: subjects.filter((item) => DEMO_SUBJECT_CODES.has(item.code)).map((item) => item.id),
    languageIds: languages.filter((item) => DEMO_LANGUAGE_CODES.has(item.code)).map((item) => item.id),
    groupIds: groups.filter((item) => DEMO_GROUP_CODES.has(item.code)).map((item) => item.id),
    academicYearIds: academicYears.filter((item) => DEMO_ACADEMIC_YEAR_NAMES.has(item.name)).map((item) => item.id),
    semesterIds: semesters.filter((item) => DEMO_SEMESTER_NAMES.has(item.name)).map((item) => item.id),
    degreeLevelIds: degreeLevels.filter((item) => DEMO_DEGREE_LEVEL_CODES.has(item.code)).map((item) => item.id),
    academicProgramIds: academicPrograms.filter((item) => DEMO_PROGRAM_CODES.has(item.code)).map((item) => item.id),
    academicSessionIds: academicSessions.filter((item) => DEMO_ACADEMIC_SESSION_CODES.has(item.code)).map((item) => item.id),
    programYearIds: programYears.filter((item) => DEMO_PROGRAM_YEAR_CODES.has(item.code)).map((item) => item.id),
    programSemesterIds: programSemesters.map((item) => item.id),
    programSubjectIds: programSubjects.map((item) => item.id),
    departmentLanguageIds: departmentLanguages.map((item) => item.id),
  }

  return {
    generatedAt: new Date().toISOString(),
    fixtureUsers,
    fixtureTeacherIds,
    fixtureStudentIds,
    fixtureExamIds,
    fixtureExams: exams.filter((exam) => fixtureExamIdSet.has(exam.id)).map((exam) => ({ id: exam.id, title: exam.title })),
    fixtureQuestionIds,
    fixtureTemplateIds,
    fixtureTemplates: templates.filter((template) => fixtureTemplateIdSet.has(template.id)).map((template) => ({ id: template.id, title: template.title })),
    fixturePublicationIds,
    fixturePublications: publications.filter((publication) => fixturePublicationIdSet.has(publication.id)).map((publication) => ({ id: publication.id, title: publication.title })),
    fixtureAttemptIds,
    fixtureAttemptAttachmentIds,
    fixtureAttachmentFiles,
    orphanAttachmentFiles,
    orphanAttachmentBytes,
    fixtureRubricIds,
    fixtureAcademicOfferingIds,
    fixtureTeacherAssignmentIds: teacherAssignments.filter((assignment) => fixtureTeacherIdSet.has(assignment.teacherId)).map((assignment) => assignment.id),
    fixtureTeachingAssignmentIds: teachingAssignments.filter((assignment) => fixtureTeacherIdSet.has(assignment.teacherId)).map((assignment) => assignment.id),
    demoAcademicMetadata,
    counts: {
      fixtureUsers: fixtureUsers.length,
      fixtureTeacherProfiles: fixtureTeacherIds.length,
      fixtureStudentProfiles: fixtureStudentIds.length,
      fixtureExams: fixtureExamIds.length,
      fixtureQuestions: fixtureQuestionIds.length,
      fixtureTemplates: fixtureTemplateIds.length,
      fixturePublications: fixturePublicationIds.length,
      fixtureAttempts: fixtureAttemptIds.length,
      fixtureAttemptAttachments: fixtureAttemptAttachmentIds.length,
      fixtureRubrics: fixtureRubricIds.length,
      orphanAttachmentFiles: orphanAttachmentFiles.length,
      orphanAttachmentBytes,
      demoDepartments: demoAcademicMetadata.departmentIds.length,
      demoSubjects: demoAcademicMetadata.subjectIds.length,
      demoLanguages: demoAcademicMetadata.languageIds.length,
      demoGroups: demoAcademicMetadata.groupIds.length,
      demoAcademicYears: demoAcademicMetadata.academicYearIds.length,
      demoSemesters: demoAcademicMetadata.semesterIds.length,
      demoDegreeLevels: demoAcademicMetadata.degreeLevelIds.length,
      demoAcademicPrograms: demoAcademicMetadata.academicProgramIds.length,
      demoAcademicSessions: demoAcademicMetadata.academicSessionIds.length,
      demoProgramYears: demoAcademicMetadata.programYearIds.length,
      demoAcademicOfferings: fixtureAcademicOfferingIds.length,
    },
  }
}

async function ensureReleaseDirs() {
  await mkdir(RELEASE_DIR, { recursive: true })
  await mkdir(BACKUP_DIR, { recursive: true })
}

async function writeJsonArtifact(name: string, payload: unknown) {
  await ensureReleaseDirs()
  const filePath = path.join(RELEASE_DIR, name)
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return filePath
}

async function writeBackup(payload: FixtureInventory) {
  await ensureReleaseDirs()
  const filePath = path.join(BACKUP_DIR, `cleanup-backup-${Date.now()}.json`)
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return filePath
}

async function deleteFiles(fileNames: string[]) {
  for (const fileName of fileNames) {
    const filePath = path.join(COURSEWORK_UPLOAD_DIR, fileName)
    await rm(filePath, { force: true }).catch(() => {})
  }
}

async function applyCleanup(inventory: FixtureInventory) {
  if (process.env.ALLOW_PRODUCTION_DATA_CLEANUP !== 'true') {
    throw new Error('Apply mode requires ALLOW_PRODUCTION_DATA_CLEANUP=true.')
  }

  const backupPath = await writeBackup(inventory)

  const userIds = inventory.fixtureUsers.map((user) => user.id)
  const teacherIds = inventory.fixtureTeacherIds
  const studentIds = inventory.fixtureStudentIds
  const examIds = inventory.fixtureExamIds
  const questionIds = inventory.fixtureQuestionIds
  const publicationIds = inventory.fixturePublicationIds
  const attemptIds = inventory.fixtureAttemptIds
  const templateIds = inventory.fixtureTemplateIds
  const rubricIds = inventory.fixtureRubricIds
  const academicOfferingIds = inventory.fixtureAcademicOfferingIds

  if (attemptIds.length > 0) {
    await prisma.courseworkAIAudit.deleteMany({ where: { review: { attemptId: { in: attemptIds } } } })
    await prisma.courseworkAIRecommendation.deleteMany({ where: { review: { attemptId: { in: attemptIds } } } })
    await prisma.courseworkAIGrammarFinding.deleteMany({ where: { review: { attemptId: { in: attemptIds } } } })
    await prisma.courseworkAICitationFinding.deleteMany({ where: { review: { attemptId: { in: attemptIds } } } })
    await prisma.courseworkAIRubricSuggestion.deleteMany({ where: { review: { attemptId: { in: attemptIds } } } })
    await prisma.courseworkAISourceMatch.deleteMany({ where: { review: { attemptId: { in: attemptIds } } } })
    await prisma.courseworkAIFinding.deleteMany({ where: { review: { attemptId: { in: attemptIds } } } })
    await prisma.courseworkAICheck.deleteMany({ where: { review: { attemptId: { in: attemptIds } } } })
    await prisma.courseworkAIReview.deleteMany({ where: { attemptId: { in: attemptIds } } })
    await prisma.courseworkAIReviewJob.deleteMany({ where: { attemptId: { in: attemptIds } } })
    await prisma.courseworkFeedbackAttachment.deleteMany({ where: { grade: { attemptId: { in: attemptIds } } } })
    await prisma.courseworkModerationDecision.deleteMany({ where: { grade: { attemptId: { in: attemptIds } } } })
    await prisma.courseworkGradeCriterionScore.deleteMany({ where: { grade: { attemptId: { in: attemptIds } } } })
    await prisma.courseworkGrade.deleteMany({ where: { attemptId: { in: attemptIds } } })
    await prisma.courseworkAttemptAttachment.deleteMany({ where: { attemptId: { in: attemptIds } } })
    await prisma.courseworkAttemptRequest.deleteMany({ where: { attemptId: { in: attemptIds } } })
    await prisma.courseworkAttempt.deleteMany({ where: { id: { in: attemptIds } } })
  }

  if (publicationIds.length > 0) {
    await prisma.courseworkPublicationTarget.deleteMany({ where: { publicationId: { in: publicationIds } } })
    await prisma.courseworkExtensionRequest.deleteMany({ where: { publicationId: { in: publicationIds } } })
    await prisma.courseworkPublication.deleteMany({ where: { id: { in: publicationIds } } })
  }

  if (rubricIds.length > 0) {
    await prisma.courseworkRubricLevel.deleteMany({ where: { criterion: { rubricId: { in: rubricIds } } } })
    await prisma.courseworkRubricCriterion.deleteMany({ where: { rubricId: { in: rubricIds } } })
    await prisma.courseworkRubric.deleteMany({ where: { id: { in: rubricIds } } })
  }

  if (templateIds.length > 0) {
    await prisma.courseworkTemplateVersion.deleteMany({ where: { templateId: { in: templateIds } } })
    await prisma.courseworkTemplate.deleteMany({ where: { id: { in: templateIds } } })
  }

  if (examIds.length > 0) {
    await prisma.resultReview.deleteMany({ where: { result: { examId: { in: examIds } } } })
    await prisma.examResult.deleteMany({ where: { examId: { in: examIds } } })
    await prisma.studentAnswer.deleteMany({ where: { attempt: { examId: { in: examIds } } } })
    await prisma.studentExamAttempt.deleteMany({ where: { examId: { in: examIds } } })
    await prisma.examSession.deleteMany({ where: { examId: { in: examIds } } })
    await prisma.examQuestion.deleteMany({ where: { examId: { in: examIds } } })
    await prisma.examTranslation.deleteMany({ where: { examId: { in: examIds } } })
    await prisma.activityLog.deleteMany({ where: { examId: { in: examIds } } })
    await prisma.exam.deleteMany({ where: { id: { in: examIds } } })
  }

  if (questionIds.length > 0) {
    await prisma.questionOptionTranslation.deleteMany({ where: { questionOption: { questionId: { in: questionIds } } } })
    await prisma.questionOption.deleteMany({ where: { questionId: { in: questionIds } } })
    await prisma.questionTranslation.deleteMany({ where: { questionId: { in: questionIds } } })
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } })
  }

  if (teacherIds.length > 0) {
    await prisma.ebookUploadTranslation.deleteMany({ where: { ebookUpload: { teacherId: { in: teacherIds } } } })
    await prisma.ebookUpload.deleteMany({ where: { teacherId: { in: teacherIds } } })
    await prisma.courseworkAssignmentTranslation.deleteMany({
      where: {
        assignment: {
          OR: [{ teacherId: { in: teacherIds } }, { studentId: { in: studentIds } }],
        },
      },
    })
    await prisma.courseworkRuleTranslation.deleteMany({ where: { rule: { teacherId: { in: teacherIds } } } })
    await prisma.courseworkSubmission.deleteMany({
      where: {
        OR: [{ studentId: { in: studentIds } }, { assignment: { teacherId: { in: teacherIds } } }],
      },
    })
    await prisma.courseworkAccessRequest.deleteMany({
      where: {
        OR: [{ studentId: { in: studentIds } }, { assignment: { teacherId: { in: teacherIds } } }],
      },
    })
    await prisma.courseworkAssignment.deleteMany({
      where: {
        OR: [{ teacherId: { in: teacherIds } }, { studentId: { in: studentIds } }],
      },
    })
    await prisma.courseworkRule.deleteMany({ where: { teacherId: { in: teacherIds } } })
    await prisma.teacherSubstitution.deleteMany({
      where: {
        OR: [{ originalTeacherId: { in: teacherIds } }, { substituteTeacherId: { in: teacherIds } }],
      },
    })
    await prisma.teacherWorkloadEntry.deleteMany({ where: { teacherId: { in: teacherIds } } })
    await prisma.teacherWorkloadPolicy.deleteMany({
      where: {
        OR: [
          { departmentId: { in: inventory.demoAcademicMetadata.departmentIds } },
          { programId: { in: inventory.demoAcademicMetadata.academicProgramIds } },
          { academicSessionId: { in: inventory.demoAcademicMetadata.academicSessionIds } },
        ],
      },
    })
    await prisma.teachingAssignmentApproval.deleteMany({ where: { teachingAssignment: { teacherId: { in: teacherIds } } } })
    await prisma.teachingAssignmentRole.deleteMany({ where: { teachingAssignment: { teacherId: { in: teacherIds } } } })
    await prisma.teachingAssignment.deleteMany({ where: { teacherId: { in: teacherIds } } })
    await prisma.teacherAssignmentAuditLog.deleteMany({
      where: {
        OR: [
          { teachingAssignment: { teacherId: { in: teacherIds } } },
          { legacyAssignment: { teacherId: { in: teacherIds } } },
        ],
      },
    })
    await prisma.teacherAssignment.deleteMany({ where: { teacherId: { in: teacherIds } } })
    await prisma.teacherDepartmentMembership.deleteMany({ where: { teacherId: { in: teacherIds } } })
    await prisma.examDutyAssignment.deleteMany({ where: { teacherId: { in: teacherIds } } })
    await prisma.examInvigilatorAssignment.deleteMany({
      where: {
        OR: [{ teacherId: { in: teacherIds } }, { replacementTeacherId: { in: teacherIds } }],
      },
    })
    await prisma.phase9OfficerAssignment.deleteMany({ where: { teacherId: { in: teacherIds } } })
  }

  if (studentIds.length > 0) {
    await prisma.studentAcademicHistory.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.studentPromotion.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.studentTransfer.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.studentLeave.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.examSeatAssignment.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.examAttendanceRecord.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.examIncident.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.examAdmitCard.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.phase9GradeEntry.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.phase9ResultAppeal.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.phase9ResultTransition.deleteMany({ where: { resultRecord: { studentId: { in: studentIds } } } })
    await prisma.phase9GraduationCandidate.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.phase9ResultRecord.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.phase9DegreeAudit.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.phase9TranscriptRecord.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.phase9MarksheetRecord.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.phase9CertificateRecord.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.studentGraduation.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.phase10VideoProgress.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.phase10LiveClassAttendance.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.phase10LessonProgress.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: studentIds } } })
    await prisma.studentSubject.deleteMany({ where: { studentId: { in: studentIds } } })
  }

  if (teacherIds.length > 0) {
    await prisma.phase9GradeComponent.deleteMany({ where: { gradebook: { teacherId: { in: teacherIds } } } })
    await prisma.phase9Gradebook.deleteMany({ where: { teacherId: { in: teacherIds } } })
  }

  if (userIds.length > 0) {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.activityLog.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.studentProfile.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.teacherProfile.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  }

  if (academicOfferingIds.length > 0) {
    try {
      await prisma.academicOffering.deleteMany({ where: { id: { in: academicOfferingIds } } })
    } catch {
      // Some demo academic offerings remain referenced by scheduling records.
      // Report them in the post-cleanup inventory instead of failing the entire cleanup pass.
    }
  }

  await deleteFiles([...inventory.fixtureAttachmentFiles, ...inventory.orphanAttachmentFiles])

  return {
    backupPath,
    postCleanup: await collectFixtureInventory(),
  }
}

async function writeSummary(mode: CleanupMode, inventory: FixtureInventory, result?: Awaited<ReturnType<typeof applyCleanup>>) {
  const payload = {
    mode,
    generatedAt: new Date().toISOString(),
    counts: inventory.counts,
    recordIds: {
      users: inventory.fixtureUsers.map((user) => user.id),
      exams: inventory.fixtureExamIds,
      templates: inventory.fixtureTemplateIds,
      publications: inventory.fixturePublicationIds,
      attempts: inventory.fixtureAttemptIds,
      academicOfferings: inventory.fixtureAcademicOfferingIds,
    },
    files: {
      referencedFixtureUploads: inventory.fixtureAttachmentFiles,
      orphanFixtureUploads: inventory.orphanAttachmentFiles,
    },
    applyResult: result
      ? {
          backupPath: path.relative(WORKDIR, result.backupPath).replace(/\\/g, '/'),
          remainingCounts: result.postCleanup.counts,
        }
      : null,
  }

  const reportName =
    mode === 'apply' ? 'data-cleanup-apply-summary.json' : 'data-cleanup-dry-run-summary.json'
  return writeJsonArtifact(reportName, payload)
}

async function main() {
  const mode = parseMode()
  await ensureReleaseDirs()

  const inventory = await collectFixtureInventory()
  console.log(JSON.stringify({ mode, counts: inventory.counts }, null, 2))

  if (mode === 'dry-run') {
    const summaryPath = await writeSummary(mode, inventory)
    console.log(`Dry-run summary written: ${summaryPath}`)
    return
  }

  const result = await applyCleanup(inventory)
  const summaryPath = await writeSummary(mode, inventory, result)
  console.log(
    JSON.stringify(
      {
        backupPath: result.backupPath,
        summaryPath,
        remainingCounts: result.postCleanup.counts,
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
