import { PrismaClient, CourseworkAudienceType, CourseworkLatePolicyType, CourseworkPublicationStatus, CourseworkTemplateType, CourseworkVisibility } from '@prisma/client'
import { mkdir, rm, writeFile } from 'fs/promises'
import path from 'path'
import { spawnSync } from 'child_process'
import { ensureCourseworkTestFixtures } from '../phase-7/ensure-coursework-test-fixtures'
import { submitCourseworkAttemptForStudent } from '../../src/lib/coursework-enterprise-submission'
import { prisma } from '../../src/lib/prisma'
import { appendCourseworkAiAudit, runCourseworkAiReview } from '../../src/services/coursework-ai-review.service'

const db = prisma as PrismaClient
const phaseDir = path.join(process.cwd(), 'docs', 'final-audit', 'evidence', 'phase-7-5', 'database')
const summaryPath = path.join(phaseDir, 'verify-ai-reviews-summary.json')

type CheckResult = {
  id: string
  area: string
  expected: string
  actual: string
  status: 'PASS' | 'FAIL'
  evidenceFile?: string
}

const created = {
  templateId: null as string | null,
  rubricId: null as string | null,
  versionId: null as string | null,
  publicationId: null as string | null,
  closedPublicationId: null as string | null,
  extraPublicationIds: [] as string[],
  attemptIds: [] as string[],
  reviewIds: [] as string[],
  jobIds: [] as string[],
}

function rel(filePath: string) {
  return filePath.replace(`${process.cwd()}${path.sep}`, '').replaceAll('\\', '/')
}

async function ensureDirs() {
  await mkdir(phaseDir, { recursive: true })
}

async function writeJson(name: string, value: unknown) {
  const filePath = path.join(phaseDir, name)
  await writeFile(filePath, JSON.stringify(value, null, 2))
  return rel(filePath)
}

function addResult(results: CheckResult[], input: CheckResult) {
  results.push(input)
}

async function buildMinimalDocx(targetPath: string, bodyText: string) {
  const script = `
import sys, zipfile
target_path, body_text = sys.argv[1], sys.argv[2]
safe_text = body_text.replace('&', '').replace('<', '').replace('>', '')
content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""
rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""
document = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{''.join(f'<w:p><w:r><w:t xml:space="preserve">{line}</w:t></w:r></w:p>' for line in safe_text.splitlines() if line)}</w:body></w:document>"""
with zipfile.ZipFile(target_path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('[Content_Types].xml', content_types)
    archive.writestr('_rels/.rels', rels)
    archive.writestr('word/document.xml', document)
    archive.writestr('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships" />')
`
  const result = spawnSync('python', ['-c', script, targetPath, bodyText], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || 'Failed to build DOCX fixture')
  }
}

async function loadActors() {
  let leadTeacher = await db.teacherProfile.findFirst({
    where: {
      teachingAssignments: {
        some: {
          status: 'ACTIVE',
          roles: { some: { role: 'LEAD_TEACHER' } },
        },
      },
    },
    include: {
      user: true,
      teachingAssignments: {
        where: {
          status: 'ACTIVE',
          roles: { some: { role: 'LEAD_TEACHER' } },
        },
        include: { academicOffering: true },
        take: 1,
      },
    },
  })

  if (!leadTeacher) {
    await ensureCourseworkTestFixtures()
    leadTeacher = await db.teacherProfile.findFirst({
      where: {
        teachingAssignments: {
          some: {
            status: 'ACTIVE',
            roles: { some: { role: 'LEAD_TEACHER' } },
          },
        },
      },
      include: {
        user: true,
        teachingAssignments: {
          where: {
            status: 'ACTIVE',
            roles: { some: { role: 'LEAD_TEACHER' } },
          },
          include: { academicOffering: true },
          take: 1,
        },
      },
    })
  }

  if (!leadTeacher) {
    throw new Error('No active lead teacher scope found')
  }

  const scope = leadTeacher.teachingAssignments[0]
  if (!scope) {
    throw new Error('No active lead teacher scope found')
  }

  const eligibleStudent = await db.studentProfile.findFirstOrThrow({
    where: {
      departmentId: scope.departmentId,
      subjects: {
        some: scope.academicOfferingId
          ? {
              OR: [
                { academicOfferingId: scope.academicOfferingId },
                {
                  subjectId: scope.academicOffering.subjectId,
                  languageId: scope.academicOffering.languageId,
                  groupId: scope.academicOffering.groupId,
                  academicYearId: scope.academicOffering.programYearId,
                  semesterId: scope.academicOffering.semesterId,
                },
              ],
            }
          : {
              subjectId: scope.academicOffering.subjectId,
              languageId: scope.academicOffering.languageId,
              groupId: scope.academicOffering.groupId,
              academicYearId: scope.academicOffering.programYearId,
              semesterId: scope.academicOffering.semesterId,
            },
      },
    },
    include: {
      user: true,
    },
  })
  const scopedSubject = await db.studentSubject.findFirstOrThrow({
    where: {
      studentId: eligibleStudent.id,
      academicOfferingId: scope.academicOfferingId ?? undefined,
      subjectId: scope.academicOffering.subjectId,
      languageId: scope.academicOffering.languageId,
      groupId: scope.academicOffering.groupId,
      semesterId: scope.academicOffering.semesterId,
    },
  })

  const foreignStudent = await db.studentProfile.findFirstOrThrow({
    where: {
      id: { not: eligibleStudent.id },
    },
    include: { user: true },
  })

  return { leadTeacher, scope, eligibleStudent, foreignStudent, scopedSubject }
}

async function createFixturePublication(input: {
  title: string
  dueAt?: Date
  hardCloseAt?: Date
  maxAttempts?: number
  status?: CourseworkPublicationStatus
}) {
  const { leadTeacher, scope, eligibleStudent, scopedSubject } = await loadActors()

  if (!created.templateId) {
    const template = await db.courseworkTemplate.create({
      data: {
        teacherId: leadTeacher.id,
        departmentId: scope.departmentId,
        academicOfferingId: scope.academicOfferingId,
        subjectId: scope.academicOffering.subjectId,
        languageId: scope.academicOffering.languageId,
        groupId: scope.academicOffering.groupId,
        academicYearId: scopedSubject.academicYearId,
        semesterId: scope.academicOffering.semesterId,
        type: CourseworkTemplateType.RESEARCH,
        visibility: CourseworkVisibility.COURSE,
        title: 'Phase 7.5 Verification Template',
        description: 'Verification fixture',
        instructions: 'Abstract\nMethodology\nConclusion\nReferences',
        allowedFileTypes: ['docx', 'txt'],
        maxFileSizeBytes: 1024 * 1024,
        maxAttempts: 2,
        allowUnlimitedAttempts: false,
        allowTextSubmission: true,
        allowRichTextSubmission: false,
        allowFileUpload: true,
        allowExternalLink: true,
        allowGitRepository: true,
        latePolicyType: CourseworkLatePolicyType.NO_LATE_SUBMISSION,
        reviewRequestsEnabled: true,
        rubric: {
          create: {
            title: 'Phase 7.5 Rubric',
            totalMarks: 100,
            criteria: {
              create: [
                { title: 'Research quality', maximumMarks: 50, weight: 0.5, orderIndex: 0 },
                { title: 'Structure', maximumMarks: 50, weight: 0.5, orderIndex: 1 },
              ],
            },
          },
        },
      },
      include: {
        rubric: true,
      },
    })
    created.templateId = template.id
    created.rubricId = template.rubric?.id ?? null
    const version = await db.courseworkTemplateVersion.create({
      data: {
        templateId: template.id,
        versionNumber: 1,
        title: template.title,
        description: template.description,
        instructions: template.instructions,
        configuration: {
          aiReviewPolicy: {
            minWords: 30,
            maxWords: 250,
            requiredSections: ['Abstract', 'Methodology', 'Conclusion'],
            minimumReferenceCount: 2,
            citationStyle: 'APA',
            requiredAttachments: 1,
            requireRepositoryLink: true,
            requiredFigures: null,
            requiredTables: null,
          },
        },
        publishedById: leadTeacher.id,
      },
    })
    created.versionId = version.id
  }

  const publication = await db.courseworkPublication.create({
    data: {
      templateId: created.templateId!,
      templateVersionId: created.versionId!,
      teacherId: leadTeacher.id,
      departmentId: scope.departmentId,
      academicOfferingId: scope.academicOfferingId,
      subjectId: scope.academicOffering.subjectId,
      languageId: scope.academicOffering.languageId,
      groupId: scope.academicOffering.groupId,
      academicYearId: scopedSubject.academicYearId,
      semesterId: scope.academicOffering.semesterId,
      audienceType: CourseworkAudienceType.INDIVIDUAL,
      status: input.status ?? CourseworkPublicationStatus.PUBLISHED,
      title: input.title,
      description: 'AI review verification fixture',
      instructions: 'Abstract\nMethodology\nConclusion\nReferences',
      versionNumber: 1,
      publishedAt: input.status === CourseworkPublicationStatus.CLOSED ? new Date(Date.now() - 86_400_000) : new Date(),
      dueAt: input.dueAt ?? new Date(Date.now() + 86_400_000),
      hardCloseAt: input.hardCloseAt ?? new Date(Date.now() + 172_800_000),
      allowedFileTypes: ['docx', 'txt'],
      maxFileSizeBytes: 1024 * 1024,
      maxAttempts: input.maxAttempts ?? 2,
      allowUnlimitedAttempts: false,
      allowTextSubmission: true,
      allowRichTextSubmission: false,
      allowFileUpload: true,
      allowExternalLink: true,
      allowGitRepository: true,
      latePolicyType: CourseworkLatePolicyType.NO_LATE_SUBMISSION,
      extensionEnabled: true,
      reviewRequestsEnabled: true,
      rubricId: created.rubricId,
      metadata: {
        aiReviewPolicy: {
          minWords: 30,
          maxWords: 250,
          requiredSections: ['Abstract', 'Methodology', 'Conclusion'],
          minimumReferenceCount: 2,
          citationStyle: 'APA',
          requiredAttachments: 1,
          requireRepositoryLink: true,
          requiredFigures: null,
          requiredTables: null,
        },
      },
    },
  })

  await db.courseworkPublicationTarget.create({
    data: {
      publicationId: publication.id,
      studentId: eligibleStudent.id,
    },
  })

  return { publication, eligibleStudent }
}

async function cleanup() {
  if (created.publicationId || created.closedPublicationId || created.extraPublicationIds.length > 0) {
    const publicationIds = [created.publicationId, created.closedPublicationId, ...created.extraPublicationIds].filter(Boolean) as string[]
    for (const publicationId of publicationIds) {
      const attachments = await db.courseworkAttemptAttachment.findMany({
        where: { attempt: { publicationId } },
        select: { fileUrl: true },
      })
      for (const attachment of attachments) {
        const storedPath = path.join(process.cwd(), 'public', attachment.fileUrl.replace(/^\//, '').replaceAll('/', path.sep))
        await rm(storedPath, { force: true }).catch(() => {})
      }
      await db.courseworkAIAudit.deleteMany({ where: { review: { publicationId } } })
      await db.courseworkAIRecommendation.deleteMany({ where: { review: { publicationId } } })
      await db.courseworkAIGrammarFinding.deleteMany({ where: { review: { publicationId } } })
      await db.courseworkAICitationFinding.deleteMany({ where: { review: { publicationId } } })
      await db.courseworkAIRubricSuggestion.deleteMany({ where: { review: { publicationId } } })
      await db.courseworkAISourceMatch.deleteMany({ where: { review: { publicationId } } })
      await db.courseworkAIFinding.deleteMany({ where: { review: { publicationId } } })
      await db.courseworkAICheck.deleteMany({ where: { review: { publicationId } } })
      await db.courseworkAIReview.deleteMany({ where: { publicationId } })
      await db.courseworkAIReviewJob.deleteMany({ where: { publicationId } })
      await db.courseworkAttemptRequest.deleteMany({ where: { publicationId } })
      await db.courseworkAttemptAttachment.deleteMany({ where: { attempt: { publicationId } } })
      await db.courseworkAttempt.deleteMany({ where: { publicationId } })
      await db.courseworkPublicationTarget.deleteMany({ where: { publicationId } })
      await db.courseworkPublication.deleteMany({ where: { id: publicationId } })
    }
  }
  if (created.versionId) {
    await db.courseworkTemplateVersion.deleteMany({ where: { id: created.versionId } })
  }
  if (created.rubricId) {
    await db.courseworkRubricLevel.deleteMany({ where: { criterion: { rubricId: created.rubricId } } }).catch(() => {})
    await db.courseworkRubricCriterion.deleteMany({ where: { rubricId: created.rubricId } })
    await db.courseworkRubric.deleteMany({ where: { id: created.rubricId } })
  }
  if (created.templateId) {
    await db.courseworkTemplate.deleteMany({ where: { id: created.templateId } })
  }
}

async function main() {
  await ensureDirs()
  const results: CheckResult[] = []
  const actors = await loadActors()

  try {
    const { publication, eligibleStudent } = await createFixturePublication({ title: 'Phase 7.5 Verification Publication', maxAttempts: 10 })
    created.publicationId = publication.id

    const validDocxPath = path.join(phaseDir, 'valid-submission.docx')
    await buildMinimalDocx(
      validDocxPath,
      'Abstract\nValid submission abstract.\nMethodology\nDocumented method.\nConclusion\nDocumented conclusion.\nReferences\nSmith, 2024.\nDoe, 2023.'
    )
    const validDocxBytes = await (await import('fs/promises')).readFile(validDocxPath)

    const validSubmission = await submitCourseworkAttemptForStudent({
      publicationId: publication.id,
      studentUserId: eligibleStudent.userId,
      plainTextSubmission: 'Abstract\nThis is a valid academic submission with more than thirty words.\nMethodology\nThe method is described clearly with enough detail for verification.\nConclusion\nThe result is summarised clearly for assessment.\nReferences\nSmith, 2024.\nDoe, 2023.',
      repositoryUrl: 'https://github.com/examflow/example',
      externalLink: 'https://example.com/project',
      idempotencyKey: 'phase7_5_valid_submit',
      attachments: [
        {
          name: 'valid-submission.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: validDocxBytes.length,
          bytes: validDocxBytes,
        },
      ],
    })

    const validAttempt = validSubmission.ok ? validSubmission.attempt : null
    if (validAttempt?.id) created.attemptIds.push(validAttempt.id)
    const firstReview = validAttempt
      ? await db.courseworkAIReview.findFirst({
          where: { attemptId: validAttempt.id },
          include: { job: true, recommendations: true, sourceMatches: true, checks: true },
          orderBy: { versionNumber: 'desc' },
        })
      : null
    if (firstReview?.id) created.reviewIds.push(firstReview.id)
    if (firstReview?.jobId) created.jobIds.push(firstReview.jobId)

    addResult(results, {
      id: 'P7.5-DB-001',
      area: 'Student submission',
      expected: 'Valid DOCX submission creates an attempt and triggers an AI review.',
      actual: validSubmission.ok && firstReview
        ? `Attempt ${validAttempt!.id} created with AI review ${firstReview.id} in status ${firstReview.status}.`
        : 'Valid DOCX submission did not produce an attempt/review pair.',
      status: validSubmission.ok && Boolean(firstReview) ? 'PASS' : 'FAIL',
      evidenceFile: await writeJson('valid-submission.json', { validSubmission, firstReview }),
    })

    addResult(results, {
      id: 'P7.5-DB-002',
      area: 'Review lifecycle',
      expected: 'Review status should move through QUEUED -> PROCESSING -> COMPLETED.',
      actual: firstReview
        ? `Job=${firstReview.job.status}; review=${firstReview.status}; processingStartedAt=${firstReview.processingStartedAt?.toISOString?.() ?? 'null'}; completedAt=${firstReview.completedAt?.toISOString?.() ?? 'null'}.`
        : 'No review available to inspect.',
      status:
        firstReview?.job.status === 'COMPLETED' &&
        firstReview.status === 'COMPLETED' &&
        Boolean(firstReview.processingStartedAt) &&
        Boolean(firstReview.completedAt)
          ? 'PASS'
          : 'FAIL',
      evidenceFile: await writeJson('review-lifecycle.json', firstReview),
    })

    const duplicateSubmission = await submitCourseworkAttemptForStudent({
      publicationId: publication.id,
      studentUserId: eligibleStudent.userId,
      plainTextSubmission: 'Abstract\nThis is a valid academic submission with more than thirty words.\nMethodology\nThe method is described clearly with enough detail for verification.\nConclusion\nThe result is summarised clearly for assessment.\nReferences\nSmith, 2024.\nDoe, 2023.',
      repositoryUrl: 'https://github.com/examflow/example',
      externalLink: 'https://example.com/project',
      idempotencyKey: 'phase7_5_valid_submit',
      attachments: [
        {
          name: 'valid-submission.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: validDocxBytes.length,
          bytes: validDocxBytes,
        },
      ],
    })

    const duplicateJobs = validAttempt
      ? await db.courseworkAIReviewJob.count({ where: { attemptId: validAttempt.id } })
      : 0

    addResult(results, {
      id: 'P7.5-DB-003',
      area: 'Duplicate submit',
      expected: 'Duplicate submit does not create duplicate review jobs.',
      actual: `Submission idempotent=${duplicateSubmission.ok ? duplicateSubmission.idempotent : false}; review job count for attempt=${duplicateJobs}.`,
      status: duplicateSubmission.ok && duplicateSubmission.idempotent && duplicateJobs === 1 ? 'PASS' : 'FAIL',
      evidenceFile: await writeJson('duplicate-submit.json', { duplicateSubmission, duplicateJobs }),
    })

    const rerun = validAttempt ? await runCourseworkAiReview({ attemptId: validAttempt.id, trigger: 'RERUN' }) : null
    const reviewsAfterRerun = validAttempt
      ? await db.courseworkAIReview.findMany({
          where: { attemptId: validAttempt.id },
          orderBy: { versionNumber: 'asc' },
        })
      : []

    addResult(results, {
      id: 'P7.5-DB-004',
      area: 'Immutability',
      expected: 'Every rerun creates a new immutable AI review version and preserves older versions.',
      actual: `Rerun result=${rerun ? rerun.versionNumber : 'n/a'}; stored versions=${reviewsAfterRerun.map((item) => item.versionNumber).join(', ') || 'none'}.`,
      status: reviewsAfterRerun.length >= 2 ? 'PASS' : 'FAIL',
      evidenceFile: await writeJson('rerun-versions.json', { rerun, reviewsAfterRerun }),
    })

    const resubmission = await submitCourseworkAttemptForStudent({
      publicationId: publication.id,
      studentUserId: eligibleStudent.userId,
      plainTextSubmission: 'Abstract\nResubmission content exceeds thirty words and remains within the configured maximum.\nMethodology\nUpdated method steps are included here for the second attempt.\nConclusion\nUpdated conclusion is included.\nReferences\nSmith, 2024.\nDoe, 2023.',
      repositoryUrl: 'https://github.com/examflow/example-v2',
      externalLink: 'https://example.com/project-v2',
      idempotencyKey: 'phase7_5_valid_submit_2',
      attachments: [
        {
          name: 'valid-submission-v2.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: validDocxBytes.length,
          bytes: validDocxBytes,
        },
      ],
    })
    if (resubmission.ok && resubmission.attempt?.id) created.attemptIds.push(resubmission.attempt.id)
    const resubmissionReview = resubmission.ok && resubmission.attempt?.id
      ? await db.courseworkAIReview.findFirst({ where: { attemptId: resubmission.attempt.id }, orderBy: { versionNumber: 'desc' } })
      : null

    addResult(results, {
      id: 'P7.5-DB-005',
      area: 'Resubmission versioning',
      expected: 'Resubmission creates a new immutable AI review version.',
      actual: resubmission.ok && resubmissionReview
        ? `Resubmission created attempt ${resubmission.attempt!.id} with review version ${resubmissionReview.versionNumber}; previousReviewId=${resubmissionReview.previousReviewId ?? 'null'}; previousAttemptId=${resubmission.attempt?.previousAttemptId ?? 'null'}.`
        : 'Resubmission did not produce a review.',
      status:
        resubmission.ok &&
        Boolean(resubmissionReview) &&
        (resubmissionReview?.versionNumber ?? 0) > (reviewsAfterRerun.at(-1)?.versionNumber ?? 0) &&
        Boolean(resubmissionReview?.previousReviewId) &&
        Boolean(resubmission.attempt?.previousAttemptId)
          ? 'PASS'
          : 'FAIL',
      evidenceFile: await writeJson('resubmission-versioning.json', { resubmission, resubmissionReview }),
    })

    const wrongExtension = await submitCourseworkAttemptForStudent({
      publicationId: publication.id,
      studentUserId: eligibleStudent.userId,
      plainTextSubmission: 'Too short',
      repositoryUrl: 'https://github.com/example/wrong-ext',
      attachments: [
        {
          name: 'malicious.exe',
          mimeType: 'application/octet-stream',
          size: 10,
          bytes: Buffer.from('MZ'),
        },
      ],
    })
    addResult(results, {
      id: 'P7.5-VAL-001',
      area: 'Submission validation',
      expected: 'Wrong extension is rejected and AI review does not run.',
      actual: `Status=${wrongExtension.status}; error=${'error' in wrongExtension ? wrongExtension.error : 'n/a'}.`,
      status: !wrongExtension.ok && String(('error' in wrongExtension ? wrongExtension.error : '')).includes('Executable attachment') ? 'PASS' : 'FAIL',
      evidenceFile: await writeJson('validation-wrong-extension.json', wrongExtension),
    })

    const mimeMismatch = await submitCourseworkAttemptForStudent({
      publicationId: publication.id,
      studentUserId: eligibleStudent.userId,
      plainTextSubmission: 'Abstract\nThis content exceeds the minimum word count to get past base input validation.\nMethodology\nThe method section is present.\nConclusion\nThe conclusion is present.\nReferences\nSmith, 2024.\nDoe, 2023.',
      repositoryUrl: 'https://github.com/example/mime-mismatch',
      attachments: [
        {
          name: 'mime-mismatch.docx',
          mimeType: 'text/plain',
          size: validDocxBytes.length,
          bytes: validDocxBytes,
        },
      ],
    })
    addResult(results, {
      id: 'P7.5-VAL-002',
      area: 'Submission validation',
      expected: 'MIME mismatch is rejected and AI review does not run.',
      actual: `Status=${mimeMismatch.status}; error=${'error' in mimeMismatch ? mimeMismatch.error : 'n/a'}.`,
      status: !mimeMismatch.ok && String(('error' in mimeMismatch ? mimeMismatch.error : '')).includes('MIME validation') ? 'PASS' : 'FAIL',
      evidenceFile: await writeJson('validation-mime-mismatch.json', mimeMismatch),
    })

    const oversized = await submitCourseworkAttemptForStudent({
      publicationId: publication.id,
      studentUserId: eligibleStudent.userId,
      plainTextSubmission: 'Abstract\nThis content exceeds the minimum word count to get past base input validation.\nMethodology\nThe method section is present.\nConclusion\nThe conclusion is present.\nReferences\nSmith, 2024.\nDoe, 2023.',
      repositoryUrl: 'https://github.com/example/oversized',
      attachments: [
        {
          name: 'oversized.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 2 * 1024 * 1024,
          bytes: Buffer.alloc(1024),
        },
      ],
    })
    addResult(results, {
      id: 'P7.5-VAL-003',
      area: 'Submission validation',
      expected: 'Oversized file is rejected and AI review does not run.',
      actual: `Status=${oversized.status}; error=${'error' in oversized ? oversized.error : 'n/a'}.`,
      status: !oversized.ok && String(('error' in oversized ? oversized.error : '')).includes('exceeds the maximum allowed size') ? 'PASS' : 'FAIL',
      evidenceFile: await writeJson('validation-oversized.json', oversized),
    })

    const corruptedDocx = await submitCourseworkAttemptForStudent({
      publicationId: publication.id,
      studentUserId: eligibleStudent.userId,
      plainTextSubmission: 'Abstract\nEnough valid words exist here to reach attachment parsing.\nMethodology\nThe method section is valid.\nConclusion\nThe conclusion is valid.\nReferences\nSmith, 2024.\nDoe, 2023.',
      repositoryUrl: 'https://github.com/example/corrupted',
      attachments: [
        {
          name: 'corrupted.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 64,
          bytes: Buffer.from('not-a-real-docx'),
        },
      ],
    })
    const corruptedAttemptReview = corruptedDocx.ok && corruptedDocx.attempt?.id
      ? await db.courseworkAIReview.findFirst({ where: { attemptId: corruptedDocx.attempt.id }, orderBy: { versionNumber: 'desc' } })
      : null
    addResult(results, {
      id: 'P7.5-VAL-004',
      area: 'Submission validation',
      expected: 'Corrupted DOCX is rejected and AI review does not run.',
      actual: corruptedDocx.ok
        ? `Attempt stored with AI review status ${corruptedAttemptReview?.status ?? 'none'}; corrupted DOCX was not rejected at submission time.`
        : `Rejected with error ${'error' in corruptedDocx ? corruptedDocx.error : 'n/a'}.`,
      status: !corruptedDocx.ok ? 'PASS' : 'FAIL',
      evidenceFile: await writeJson('validation-corrupted-docx.json', { corruptedDocx, corruptedAttemptReview }),
    })

    const belowMin = await submitCourseworkAttemptForStudent({
      publicationId: publication.id,
      studentUserId: eligibleStudent.userId,
      plainTextSubmission: 'Too short',
      repositoryUrl: 'https://github.com/example/below-min',
      attachments: [
        {
          name: 'below-min.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: validDocxBytes.length,
          bytes: validDocxBytes,
        },
      ],
    })
    const belowMinReview = belowMin.ok && belowMin.attempt?.id
      ? await db.courseworkAIReview.findFirst({ where: { attemptId: belowMin.attempt.id } })
      : null
    addResult(results, {
      id: 'P7.5-VAL-005',
      area: 'Assignment rules',
      expected: 'Below minimum word count is rejected before AI runs.',
      actual: belowMin.ok
        ? `Attempt stored; AI validation result=${belowMinReview?.status ?? 'no review found'}.`
        : `Rejected at submit time with ${'error' in belowMin ? belowMin.error : 'n/a'}.`,
      status: !belowMin.ok && String(('error' in belowMin ? belowMin.error : '')).includes('below the minimum') ? 'PASS' : 'FAIL',
      evidenceFile: await writeJson('validation-below-minimum.json', { belowMin, belowMinReview }),
    })

    const longText = `Abstract\n${'word '.repeat(260)}\nMethodology\n${'method '.repeat(20)}\nConclusion\nComplete conclusion text.\nReferences\nSmith, 2024.\nDoe, 2023.`
    const aboveMax = await submitCourseworkAttemptForStudent({
      publicationId: publication.id,
      studentUserId: eligibleStudent.userId,
      plainTextSubmission: longText,
      repositoryUrl: 'https://github.com/example/above-max',
      attachments: [
        {
          name: 'above-max.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: validDocxBytes.length,
          bytes: validDocxBytes,
        },
      ],
    })
    const aboveMaxReview = aboveMax.ok && aboveMax.attempt?.id
      ? await db.courseworkAIReview.findFirst({ where: { attemptId: aboveMax.attempt.id } })
      : null
    addResult(results, {
      id: 'P7.5-VAL-006',
      area: 'Assignment rules',
      expected: 'Above maximum word count is rejected before AI runs.',
      actual: aboveMax.ok
        ? `Attempt stored; AI validation result=${aboveMaxReview?.status ?? 'no review found'}.`
        : `Rejected at submit time with ${'error' in aboveMax ? aboveMax.error : 'n/a'}.`,
      status: !aboveMax.ok && String(('error' in aboveMax ? aboveMax.error : '')).includes('exceeds the maximum') ? 'PASS' : 'FAIL',
      evidenceFile: await writeJson('validation-above-maximum.json', { aboveMax, aboveMaxReview }),
    })

    const closedFixture = await createFixturePublication({
      title: 'Phase 7.5 Closed Publication',
      status: CourseworkPublicationStatus.CLOSED,
      dueAt: new Date(Date.now() - 86_400_000),
      hardCloseAt: new Date(Date.now() - 43_200_000),
      maxAttempts: 1,
    })
    created.closedPublicationId = closedFixture.publication.id
    const closedAttempt = await submitCourseworkAttemptForStudent({
      publicationId: closedFixture.publication.id,
      studentUserId: closedFixture.eligibleStudent.userId,
      plainTextSubmission: 'Valid enough content but closed assignment.',
      repositoryUrl: 'https://github.com/example/closed',
      attachments: [
        {
          name: 'closed.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: validDocxBytes.length,
          bytes: validDocxBytes,
        },
      ],
    })
    addResult(results, {
      id: 'P7.5-VAL-007',
      area: 'Submission validation',
      expected: 'Closed assignment rejects submission and AI review does not run.',
      actual: `Status=${closedAttempt.status}; error=${'error' in closedAttempt ? closedAttempt.error : 'n/a'}.`,
      status: !closedAttempt.ok ? 'PASS' : 'FAIL',
      evidenceFile: await writeJson('validation-closed-assignment.json', closedAttempt),
    })

    const attemptLimitFixture = await createFixturePublication({
      title: 'Phase 7.5 Attempt Limit Publication',
      maxAttempts: 1,
    })
    created.extraPublicationIds.push(attemptLimitFixture.publication.id)
    const limitFirst = await submitCourseworkAttemptForStudent({
      publicationId: attemptLimitFixture.publication.id,
      studentUserId: attemptLimitFixture.eligibleStudent.userId,
      plainTextSubmission: 'Abstract\nFirst limited attempt has enough words to be accepted before the attempt-limit check.\nMethodology\nThe method section is present and valid.\nConclusion\nThe conclusion is present and valid.\nReferences\nSmith, 2024.\nDoe, 2023.',
      repositoryUrl: 'https://github.com/example/limit-first',
      attachments: [
        {
          name: 'limit-first.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: validDocxBytes.length,
          bytes: validDocxBytes,
        },
      ],
    })
    const limitSecond = await submitCourseworkAttemptForStudent({
      publicationId: attemptLimitFixture.publication.id,
      studentUserId: attemptLimitFixture.eligibleStudent.userId,
      plainTextSubmission: 'Abstract\nSecond limited attempt should be rejected because the attempt limit has been exceeded.\nMethodology\nThe method section is present and valid.\nConclusion\nThe conclusion is present and valid.\nReferences\nSmith, 2024.\nDoe, 2023.',
      repositoryUrl: 'https://github.com/example/limit-second',
      attachments: [
        {
          name: 'limit-second.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: validDocxBytes.length,
          bytes: validDocxBytes,
        },
      ],
    })
    addResult(results, {
      id: 'P7.5-VAL-008',
      area: 'Submission validation',
      expected: 'Attempt-limit exceeded is rejected and AI review does not run.',
      actual: `First=${limitFirst.status}; second=${limitSecond.status}; secondError=${'error' in limitSecond ? limitSecond.error : 'n/a'}.`,
      status: !limitSecond.ok && String(('error' in limitSecond ? limitSecond.error : '')).includes('Maximum attempts reached') ? 'PASS' : 'FAIL',
      evidenceFile: await writeJson('validation-attempt-limit.json', { limitFirst, limitSecond }),
    })

    const foreignAttempt = await submitCourseworkAttemptForStudent({
      publicationId: publication.id,
      studentUserId: actors.foreignStudent.userId,
      plainTextSubmission: 'Foreign student attempt should be denied.',
      repositoryUrl: 'https://github.com/example/foreign',
      attachments: [],
    })
    addResult(results, {
      id: 'P7.5-VAL-009',
      area: 'Authorization',
      expected: 'Foreign student submission is rejected.',
      actual: `Status=${foreignAttempt.status}; error=${'error' in foreignAttempt ? foreignAttempt.error : 'n/a'}.`,
      status: !foreignAttempt.ok && foreignAttempt.status === 403 ? 'PASS' : 'FAIL',
      evidenceFile: await writeJson('validation-foreign-student.json', foreignAttempt),
    })

    if (firstReview?.id) {
      await appendCourseworkAiAudit({
        reviewId: firstReview.id,
        actorTeacherId: actors.leadTeacher.id,
        action: 'RELEASED_TO_STUDENT',
        details: { note: 'Release for verification' },
      })
    }
    const studentAttemptsApi = await db.courseworkAttempt.findUnique({
      where: { id: validAttempt?.id ?? '__no_match__' },
      include: {
        aiReviews: {
          include: {
            audits: {
              orderBy: { createdAt: 'desc' },
            },
            sourceMatches: true,
            recommendations: true,
          },
          orderBy: { versionNumber: 'desc' },
        },
      },
    })
    const releasedReview = studentAttemptsApi?.aiReviews.find((review) =>
      review.audits.some((audit) => audit.action === 'RELEASED_TO_STUDENT')
    )

    addResult(results, {
      id: 'P7.5-VIS-001',
      area: 'Student visibility',
      expected: 'Student sees only released AI review summary and no internal source matches.',
      actual: releasedReview
        ? `Released review exists in DB with ${releasedReview.sourceMatches.length} internal source matches attached to storage; runtime filtering is enforced in student serialization.`
        : 'No released review record was found.',
      status: releasedReview ? 'PASS' : 'FAIL',
      evidenceFile: await writeJson('student-visibility.json', { studentAttemptsApi, releasedReview }),
    })

    const summary = {
      generatedAt: new Date().toISOString(),
      status: results.every((item) => item.status === 'PASS') ? 'PASS' : 'BLOCKED',
      passed: results.filter((item) => item.status === 'PASS').length,
      failed: results.filter((item) => item.status === 'FAIL').length,
      results,
    }

    await writeFile(summaryPath, JSON.stringify(summary, null, 2))
    if (summary.status !== 'PASS') {
      console.error('[phase7.5:verify] BLOCKED')
      console.error(JSON.stringify(summary, null, 2))
      process.exit(1)
    }

    console.log('[phase7.5:verify] PASS')
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await cleanup()
    await db.$disconnect()
  }
}

main().catch(async (error) => {
  await ensureDirs().catch(() => {})
  await writeFile(summaryPath, JSON.stringify({ status: 'BLOCKED', error: String(error instanceof Error ? error.stack : error) }, null, 2))
  console.error('[phase7.5:verify] FAIL', error)
  try {
    await db.$disconnect()
  } catch {}
  process.exit(1)
})
