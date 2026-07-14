import { isExecutableCourseworkAttachmentExtension } from '@/lib/coursework-enterprise'
import { parseCourseworkAiReviewPolicy } from '@/lib/coursework-ai-review'
import {
  countCourseworkWords,
  extractCourseworkDocumentFromStoredFile,
  extractReferencesSection,
  extractSectionNames,
} from '@/lib/coursework-document'
import { prisma } from '@/lib/prisma'
import { getAiConfig } from '@/lib/system-settings'
import {
  AiProvider,
  CourseworkAICheckStatus,
  CourseworkAICheckType,
  CourseworkAIRecommendationCode,
  CourseworkAIReviewJobStatus,
  CourseworkAIReviewStatus,
  CourseworkAIWritingRiskLevel,
  Prisma,
} from '@prisma/client'

const PROMPT_VERSION = 'phase-7.5-review-v1'
const HEURISTIC_MODEL = 'coursework-review-heuristic-v1'
const JOB_TIMEOUT_MS = 90_000
const STALE_ERROR_CODE = 'STALE_JOB_TIMEOUT'
const VALIDATION_ERROR_CODE = 'VALIDATION_FAILED'
const PROCESSING_ERROR_CODE = 'AI_REVIEW_FAILED'

type AttemptRecord = Awaited<ReturnType<typeof loadAttemptForReview>>
type ValidationIssue = { code: string; message: string; severity: 'INFO' | 'WARNING' | 'ERROR' }
type GrammarIssue = { issueType: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; sentenceText?: string; suggestion?: string; explanation?: string }
type CitationIssue = { issueType: string; description: string; referenceText?: string; locationLabel?: string }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0
  }

  return clamp((numerator / denominator) * 100, 0, 100)
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokenize(text: string) {
  return normalizeText(text).split(/[^a-z0-9]+/i).filter((token) => token.length > 2)
}

function createShingles(text: string, size = 5) {
  const tokens = tokenize(text)
  if (tokens.length === 0) {
    return new Set<string>()
  }

  if (tokens.length <= size) {
    return new Set([tokens.join(' ')])
  }

  const shingles = new Set<string>()
  for (let index = 0; index <= tokens.length - size; index += 1) {
    shingles.add(tokens.slice(index, index + size).join(' '))
  }

  return shingles
}

function jaccardSimilarity(left: string, right: string) {
  const leftShingles = createShingles(left)
  const rightShingles = createShingles(right)

  if (leftShingles.size === 0 || rightShingles.size === 0) {
    return 0
  }

  let intersection = 0
  for (const value of leftShingles) {
    if (rightShingles.has(value)) {
      intersection += 1
    }
  }

  return toPercent(intersection, leftShingles.size + rightShingles.size - intersection)
}

function detectCitationStyle(text: string) {
  if (/\(\s*[A-Z][A-Za-z-]+,\s*\d{4}[a-z]?\s*\)/.test(text)) return 'APA'
  if (/\[\d+\]/.test(text)) return 'IEEE'
  if (/\([A-Z][A-Za-z-]+\s+\d+\)/.test(text)) return 'MLA'
  if (/\([A-Z][A-Za-z-]+\s+\d{4}\)/.test(text)) return 'HARVARD'
  if (/\bdoi:\s*10\.\d{4,9}\//i.test(text)) return 'CHICAGO'
  return null
}

async function loadAttemptForReview(attemptId: string) {
  return prisma.courseworkAttempt.findUnique({
    where: { id: attemptId },
    include: {
      student: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      publication: {
        include: {
          teacher: {
            include: {
              user: {
                select: {
                  id: true,
                },
              },
            },
          },
          rubric: {
            include: {
              criteria: {
                include: {
                  levels: {
                    orderBy: { orderIndex: 'asc' },
                  },
                },
                orderBy: { orderIndex: 'asc' },
              },
            },
          },
        },
      },
      attachments: true,
      aiReviews: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
    },
  })
}

async function createSimilarityMatches(attempt: NonNullable<AttemptRecord>, extractedText: string) {
  const peers = await prisma.courseworkAttempt.findMany({
    where: {
      publicationId: attempt.publicationId,
      id: { not: attempt.id },
    },
    include: {
      student: {
        include: {
          user: {
            select: {
              name: true,
            },
          },
        },
      },
      aiReviews: {
        where: {
          status: CourseworkAIReviewStatus.COMPLETED,
        },
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 25,
  })

  return peers
    .map((peer) => {
      const comparisonText =
        peer.aiReviews[0]?.extractedText ||
        [peer.plainTextSubmission, peer.richTextSubmission].filter(Boolean).join('\n\n')
      const similarityPercent = jaccardSimilarity(extractedText, comparisonText)

      return {
        matchedStudentId: peer.studentId,
        providerKey: 'internal:coursework-attempt',
        sourceTitle: `${peer.publicationId === attempt.publicationId ? 'Coursework submission' : 'Coursework'} by ${peer.student.user.name}`,
        sourceUrl: null,
        matchedText: comparisonText.slice(0, 800),
        similarityPercent,
        sourceType: peer.studentId === attempt.studentId ? 'PREVIOUS_ATTEMPT' : 'OTHER_STUDENT',
        teacherEvidence: similarityPercent >= 35 ? 'High lexical overlap detected against internal coursework repository.' : 'Low overlap detected.',
        metadata: {
          comparedAttemptId: peer.id,
          comparedAttemptNumber: peer.attemptNumber,
        },
      }
    })
    .filter((match) => match.similarityPercent >= 10)
    .sort((left, right) => right.similarityPercent - left.similarityPercent)
    .slice(0, 5)
}

function buildValidationIssues(attempt: NonNullable<AttemptRecord>, extractedText: string, parseFailures: string[]) {
  const policy = parseCourseworkAiReviewPolicy(attempt.publication.metadata)
  const issues: ValidationIssue[] = []

  if (!attempt.submittedAt) {
    issues.push({ code: 'not_submitted', message: 'Attempt does not have a submitted timestamp.', severity: 'ERROR' })
  }

  if (attempt.publication.status !== 'PUBLISHED' && attempt.publication.status !== 'CLOSED') {
    issues.push({ code: 'publication_state', message: 'Publication is not in a reviewable state.', severity: 'ERROR' })
  }

  if (
    attempt.finalContentHash &&
    attempt.aiReviews[0] &&
    attempt.aiReviews[0].status === CourseworkAIReviewStatus.COMPLETED &&
    attempt.aiReviews[0].validationPassed
  ) {
    issues.push({ code: 'duplicate_ai_review', message: 'This submission already has a completed AI review for the latest content hash.', severity: 'INFO' })
  }

  for (const attachment of attempt.attachments) {
    const extensionName = (attachment.extension || attachment.fileName.split('.').pop() || '').toLowerCase()
    if (isExecutableCourseworkAttachmentExtension(extensionName)) {
      issues.push({ code: 'executable_file', message: `${attachment.fileName} is executable and not reviewable.`, severity: 'ERROR' })
    }
    if (attachment.fileSizeBytes <= 0) {
      issues.push({ code: 'empty_file', message: `${attachment.fileName} is empty.`, severity: 'ERROR' })
    }
    if (attachment.malwareStatus === 'FLAGGED') {
      issues.push({ code: 'malware_flagged', message: `${attachment.fileName} was flagged by the virus-safe hook.`, severity: 'ERROR' })
    }
    if (!attachment.mimeType.trim()) {
      issues.push({ code: 'missing_mime', message: `${attachment.fileName} is missing MIME metadata.`, severity: 'ERROR' })
    }
  }

  for (const parseFailure of parseFailures) {
    issues.push({ code: 'parse_failure', message: parseFailure, severity: 'ERROR' })
  }

  const wordCount = countCourseworkWords(extractedText)
  if (policy.minWords && wordCount < policy.minWords) {
    issues.push({ code: 'minimum_words', message: `Word count ${wordCount} is below the minimum ${policy.minWords}.`, severity: 'ERROR' })
  }
  if (policy.maxWords && wordCount > policy.maxWords) {
    issues.push({ code: 'maximum_words', message: `Word count ${wordCount} exceeds the maximum ${policy.maxWords}.`, severity: 'ERROR' })
  }
  if (policy.requireRepositoryLink && !attempt.repositoryUrl?.trim()) {
    issues.push({ code: 'repository_required', message: 'A repository link is required for this coursework.', severity: 'ERROR' })
  }
  if (policy.requiredAttachments && attempt.attachments.length < policy.requiredAttachments) {
    issues.push({
      code: 'required_attachments',
      message: `At least ${policy.requiredAttachments} attachment(s) are required.`,
      severity: 'ERROR',
    })
  }

  return issues
}

function buildComplianceAnalysis(attempt: NonNullable<AttemptRecord>, normalizedDocument: Record<string, unknown>, extractedText: string) {
  const policy = parseCourseworkAiReviewPolicy(attempt.publication.metadata)
  const headings = Array.isArray(normalizedDocument.headings) ? normalizedDocument.headings.map((heading) => String(heading)) : []
  const references = Array.isArray(normalizedDocument.references) ? normalizedDocument.references : []
  const missingSections = policy.requiredSections.filter(
    (section) => !headings.some((heading) => heading.toLowerCase().includes(section.toLowerCase()))
  )
  const missingRules: string[] = []

  if (policy.requireRepositoryLink && !attempt.repositoryUrl?.trim()) {
    missingRules.push('Repository link')
  }
  if (policy.requiredAttachments && attempt.attachments.length < policy.requiredAttachments) {
    missingRules.push(`Attachments (${attempt.attachments.length}/${policy.requiredAttachments})`)
  }
  if (policy.requiredFigures && !/figure\s+\d+/i.test(extractedText)) {
    missingRules.push(`Figures (${policy.requiredFigures} required)`)
  }
  if (policy.requiredTables && !/table\s+\d+/i.test(extractedText)) {
    missingRules.push(`Tables (${policy.requiredTables} required)`)
  }

  const referenceShortfall =
    policy.minimumReferenceCount && references.length < policy.minimumReferenceCount
      ? policy.minimumReferenceCount - references.length
      : 0

  const totalChecks = [
    policy.requiredSections.length > 0 ? policy.requiredSections.length : 0,
    policy.minimumReferenceCount ? 1 : 0,
    policy.requiredFigures ? 1 : 0,
    policy.requiredTables ? 1 : 0,
    policy.requireRepositoryLink ? 1 : 0,
    policy.requiredAttachments ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0)

  const failedChecks =
    missingSections.length +
    (referenceShortfall > 0 ? 1 : 0) +
    missingRules.length

  return {
    complianceScore: totalChecks === 0 ? 100 : clamp(100 - (failedChecks / totalChecks) * 100, 0, 100),
    missingSections,
    missingReferences: referenceShortfall > 0 ? referenceShortfall : 0,
    missingRules,
    citationStyleExpected: policy.citationStyle,
  }
}

function buildGrammarAnalysis(text: string) {
  const sentences = splitSentences(text)
  const repeatedPhrases = text.match(/\b(\w+(?:\s+\w+){0,4})\b(?:[\s\S]{0,120})\b\1\b/gi) ?? []
  const passiveVoiceCount = (text.match(/\b(?:was|were|is|are|been|be)\s+\w+ed\b/gi) ?? []).length
  const uppercaseSentences = sentences.filter((sentence) => sentence.length > 20 && sentence === sentence.toUpperCase())
  const veryLongSentences = sentences.filter((sentence) => countCourseworkWords(sentence) > 35)
  const missingTerminalPunctuation = sentences.filter((sentence) => !/[.!?]$/.test(sentence))

  const findings: GrammarIssue[] = []

  for (const sentence of veryLongSentences.slice(0, 5)) {
    findings.push({
      issueType: 'SENTENCE_COMPLEXITY',
      severity: 'MEDIUM',
      sentenceText: sentence,
      suggestion: 'Split this sentence into smaller clauses.',
      explanation: 'Very long sentences reduce readability and clarity.',
    })
  }

  for (const sentence of missingTerminalPunctuation.slice(0, 5)) {
    findings.push({
      issueType: 'TERMINAL_PUNCTUATION',
      severity: 'LOW',
      sentenceText: sentence,
      suggestion: 'Add terminal punctuation.',
      explanation: 'Academic writing should end declarative sentences consistently.',
    })
  }

  if (repeatedPhrases.length > 0) {
    findings.push({
      issueType: 'REPEATED_WORDING',
      severity: 'MEDIUM',
      suggestion: 'Vary repeated phrases and transitions.',
      explanation: `Detected ${repeatedPhrases.length} repeated wording patterns.`,
    })
  }

  if (uppercaseSentences.length > 0) {
    findings.push({
      issueType: 'ACADEMIC_TONE',
      severity: 'MEDIUM',
      suggestion: 'Avoid full-uppercase sentences.',
      explanation: 'Uppercase emphasis reduces formal academic tone.',
    })
  }

  const averageSentenceLength =
    sentences.length > 0 ? sentences.reduce((sum, sentence) => sum + countCourseworkWords(sentence), 0) / sentences.length : 0

  const penalty =
    veryLongSentences.length * 7 +
    missingTerminalPunctuation.length * 3 +
    repeatedPhrases.length * 4 +
    passiveVoiceCount * 1.5 +
    uppercaseSentences.length * 5

  return {
    score: clamp(100 - penalty, 0, 100),
    findings,
    readability: averageSentenceLength,
    passiveVoiceCount,
  }
}

function buildCitationAnalysis(text: string) {
  const referencesSection = extractReferencesSection(text)
  const references = referencesSection
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const inlineCitationCount = (text.match(/\([A-Z][A-Za-z-]+(?:,\s*\d{4})?\)|\[\d+\]/g) ?? []).length
  const duplicateReferences = references.filter((value, index) => references.indexOf(value) !== index)
  const fakeDois = references.filter((reference) => /\bdoi\b/i.test(reference) && !/10\.\d{4,9}\//.test(reference))
  const findings: CitationIssue[] = []

  if (references.length === 0) {
    findings.push({
      issueType: 'MISSING_REFERENCES',
      description: 'No references section was detected.',
      locationLabel: 'References',
    })
  }

  if (inlineCitationCount === 0 && references.length > 0) {
    findings.push({
      issueType: 'MISSING_INLINE_CITATIONS',
      description: 'References exist but inline citations were not detected.',
      locationLabel: 'Body',
    })
  }

  for (const reference of duplicateReferences.slice(0, 5)) {
    findings.push({
      issueType: 'DUPLICATE_REFERENCE',
      description: 'Duplicate reference entry detected.',
      referenceText: reference,
      locationLabel: 'References',
    })
  }

  for (const reference of fakeDois.slice(0, 5)) {
    findings.push({
      issueType: 'FAKE_DOI',
      description: 'Reference includes an invalid DOI pattern.',
      referenceText: reference,
      locationLabel: 'References',
    })
  }

  const style = detectCitationStyle(text)
  const score = clamp(100 - findings.length * 12 - Math.max(0, references.length === 0 ? 25 : 0), 0, 100)

  return {
    score,
    findings,
    style,
    referenceCount: references.length,
    inlineCitationCount,
  }
}

function buildWritingRisk(text: string) {
  const sentences = splitSentences(text)
  const sentenceLengths = sentences.map((sentence) => countCourseworkWords(sentence))
  const average = sentenceLengths.length > 0
    ? sentenceLengths.reduce((sum, value) => sum + value, 0) / sentenceLengths.length
    : 0
  const variance = sentenceLengths.length > 1
    ? sentenceLengths.reduce((sum, value) => sum + (value - average) ** 2, 0) / sentenceLengths.length
    : 0
  const burstiness = Math.sqrt(variance)
  const uniqueTokenRatio = (() => {
    const tokens = tokenize(text)
    if (tokens.length === 0) return 0
    return new Set(tokens).size / tokens.length
  })()

  if (sentences.length < 4 || countCourseworkWords(text) < 120) {
    return {
      level: CourseworkAIWritingRiskLevel.INCONCLUSIVE,
      score: 50,
      evidence: 'Document length is too small for reliable writing-risk analysis.',
    }
  }

  const score = clamp(
    35 +
      (burstiness < 4 ? 18 : 0) +
      (uniqueTokenRatio < 0.38 ? 20 : 0) +
      (average > 24 ? 12 : 0),
    0,
    100
  )

  const level =
    score >= 75
      ? CourseworkAIWritingRiskLevel.HIGH
      : score >= 55
        ? CourseworkAIWritingRiskLevel.MEDIUM
        : CourseworkAIWritingRiskLevel.LOW

  return {
    level,
    score,
    evidence: `Burstiness ${burstiness.toFixed(1)}, lexical diversity ${(uniqueTokenRatio * 100).toFixed(1)}%, average sentence length ${average.toFixed(1)} words.`,
  }
}

function buildRubricSuggestions(attempt: NonNullable<AttemptRecord>, text: string) {
  const rubric = attempt.publication.rubric
  if (!rubric) {
    return []
  }

  const normalizedText = normalizeText(text)

  return rubric.criteria.map((criterion) => {
    const criterionTokens = tokenize(`${criterion.title} ${criterion.description ?? ''}`)
    const matchedTokens = criterionTokens.filter((token) => normalizedText.includes(token))
    const evidenceWords = matchedTokens.slice(0, 8)
    const ratio = criterionTokens.length > 0 ? matchedTokens.length / criterionTokens.length : 0.5
    const suggestedScore = clamp(criterion.maximumMarks * clamp(0.35 + ratio, 0.15, 1), 0, criterion.maximumMarks)
    const confidence = clamp(0.45 + ratio / 2, 0.2, 0.95)

    return {
      criterionId: criterion.id,
      suggestedScore,
      confidence,
      reason: matchedTokens.length > 0
        ? `Criterion keywords matched in the submission: ${matchedTokens.slice(0, 6).join(', ')}.`
        : 'Limited direct evidence was found for this criterion in the extracted text.',
      evidenceText: evidenceWords.length > 0 ? evidenceWords.join(', ') : null,
      metadata: {
        criterionTitle: criterion.title,
        maximumMarks: criterion.maximumMarks,
      },
    }
  })
}

function buildRecommendation(input: {
  complianceScore: number
  similarityScore: number
  grammarScore: number
  citationScore: number
  writingRiskLevel: CourseworkAIWritingRiskLevel
}) {
  if (input.similarityScore >= 45) {
    return {
      code: CourseworkAIRecommendationCode.HIGH_SIMILARITY_REVIEW,
      confidence: 0.88,
      rationale: 'High internal similarity overlap requires manual academic integrity review.',
    }
  }

  if (input.writingRiskLevel === CourseworkAIWritingRiskLevel.HIGH) {
    return {
      code: CourseworkAIRecommendationCode.MANUAL_REVIEW_REQUIRED,
      confidence: 0.81,
      rationale: 'Writing-risk indicators are elevated and should be reviewed by a teacher before grading.',
    }
  }

  if (input.complianceScore < 60 || input.citationScore < 55) {
    return {
      code: CourseworkAIRecommendationCode.RETURN_FOR_REVISION,
      confidence: 0.76,
      rationale: 'Submission rule or citation compliance gaps suggest revision before grading.',
    }
  }

  if (input.grammarScore >= 75 && input.complianceScore >= 80) {
    return {
      code: CourseworkAIRecommendationCode.APPROVE_SUGGESTED,
      confidence: 0.72,
      rationale: 'Submission is structurally compliant and ready for teacher grading review.',
    }
  }

  return {
    code: CourseworkAIRecommendationCode.READY_FOR_REVIEW,
    confidence: 0.64,
    rationale: 'Submission can proceed to teacher review with AI findings attached.',
  }
}

async function markStaleReviewJobs(attemptId: string) {
  const staleJobs = await prisma.courseworkAIReviewJob.findMany({
    where: {
      attemptId,
      status: CourseworkAIReviewJobStatus.PROCESSING,
      leaseExpiresAt: { lt: new Date() },
    },
    select: {
      id: true,
      review: {
        select: {
          id: true,
        },
      },
    },
  })

  if (staleJobs.length === 0) {
    return
  }

  const now = new Date()
  const staleJobIds = staleJobs.map((job) => job.id)
  const staleReviewIds = staleJobs.flatMap((job) => (job.review?.id ? [job.review.id] : []))

  await prisma.courseworkAIReviewJob.updateMany({
    where: { id: { in: staleJobIds } },
    data: {
      status: CourseworkAIReviewJobStatus.CANCELLED,
      failedAt: now,
      completedAt: now,
      errorMessage: STALE_ERROR_CODE,
      progressPercent: 100,
    },
  })

  if (staleReviewIds.length > 0) {
    await prisma.courseworkAIReview.updateMany({
      where: { id: { in: staleReviewIds } },
      data: {
        status: CourseworkAIReviewStatus.CANCELLED,
        errorCode: STALE_ERROR_CODE,
        errorMessage: 'Review processing timed out and was cancelled for recovery.',
        completedAt: now,
      },
    })
  }
}

export async function runCourseworkAiReview(input: {
  attemptId: string
  trigger: 'SUBMISSION' | 'RERUN'
  requestedByUserId?: string | null
}) {
  const attempt = await loadAttemptForReview(input.attemptId)
  if (!attempt) {
    throw new Error('Coursework attempt not found')
  }

  await markStaleReviewJobs(attempt.id)

  const activeJob = await prisma.courseworkAIReviewJob.findFirst({
    where: {
      attemptId: attempt.id,
      status: {
        in: [
          CourseworkAIReviewJobStatus.QUEUED,
          CourseworkAIReviewJobStatus.PROCESSING,
          CourseworkAIReviewJobStatus.RETRYING,
        ],
      },
    },
    include: {
      review: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  if (activeJob?.review) {
    return {
      reviewId: activeJob.review.id,
      versionNumber: activeJob.review.versionNumber,
      validationPassed: activeJob.review.validationPassed,
      deduplicated: true,
    }
  }

  const providerConfig = await getAiConfig()
  const latestReviewAcrossChain = await prisma.courseworkAIReview.findFirst({
    where: {
      publicationId: attempt.publicationId,
      studentId: attempt.studentId,
    },
    orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }],
  })
  const job = await prisma.courseworkAIReviewJob.create({
    data: {
      publicationId: attempt.publicationId,
      attemptId: attempt.id,
      trigger: input.trigger,
      status: CourseworkAIReviewJobStatus.QUEUED,
      progressPercent: 5,
    },
  })

  const startedAt = Date.now()
  const review = await prisma.courseworkAIReview.create({
    data: {
      publicationId: attempt.publicationId,
      attemptId: attempt.id,
      studentId: attempt.studentId,
      jobId: job.id,
      previousReviewId: latestReviewAcrossChain?.id ?? null,
      versionNumber: (latestReviewAcrossChain?.versionNumber ?? 0) + 1,
      status: CourseworkAIReviewStatus.QUEUED,
      provider: providerConfig.enabled ? providerConfig.provider ?? null : null,
      providerName: providerConfig.enabled ? providerConfig.provider ?? 'LOCAL' : 'LOCAL',
      modelName: providerConfig.enabled ? (
        providerConfig.provider === AiProvider.OPENAI
          ? providerConfig.openaiModel
          : providerConfig.provider === AiProvider.GEMINI
            ? providerConfig.geminiModel
            : providerConfig.claudeModel
      ) : HEURISTIC_MODEL,
      promptVersion: PROMPT_VERSION,
      summary: 'AI review has been queued for processing.',
    },
  })

  try {
    const processingStartedAt = new Date()
    await prisma.$transaction([
      prisma.courseworkAIReviewJob.update({
        where: { id: job.id },
        data: {
          status: CourseworkAIReviewJobStatus.PROCESSING,
          startedAt: processingStartedAt,
          leaseExpiresAt: new Date(processingStartedAt.getTime() + JOB_TIMEOUT_MS),
          progressPercent: 12,
        },
      }),
      prisma.courseworkAIReview.update({
        where: { id: review.id },
        data: {
          status: CourseworkAIReviewStatus.PROCESSING,
          processingStartedAt,
          summary: 'AI review is processing.',
        },
      }),
    ])

    const extractedParts = [
      attempt.plainTextSubmission?.trim() || '',
      attempt.richTextSubmission?.trim() || '',
    ].filter(Boolean)

    const normalizedDocuments: Record<string, unknown>[] = []
    const parseFailures: string[] = []
    let documentFormat: string = attempt.submissionType

    for (const attachment of attempt.attachments) {
      try {
        const parsed = await extractCourseworkDocumentFromStoredFile(attachment)
        if (parsed.text) {
          extractedParts.push(parsed.text)
        }
        normalizedDocuments.push(parsed.normalizedDocument)
        if (attachment.isPrimary) {
          documentFormat = parsed.format
        }
      } catch (error) {
        parseFailures.push(
          error instanceof Error
            ? `${attachment.fileName}: ${error.message}`
            : `${attachment.fileName}: document parsing failed`
        )
      }
    }

    const extractedText = extractedParts.join('\n\n').trim()
    const validationIssues = buildValidationIssues(attempt, extractedText, parseFailures)
    const validationPassed = validationIssues.every((issue) => issue.severity !== 'ERROR')
    const versionNumber = review.versionNumber
    const wordCount = countCourseworkWords(extractedText)
    const characterCount = extractedText.length

    await prisma.courseworkAIReviewJob.update({
      where: { id: job.id },
      data: {
        progressPercent: validationPassed ? 35 : 100,
      },
    })

    await prisma.courseworkAIReview.update({
      where: { id: review.id },
      data: {
        validationPassed,
        documentFormat,
        extractedWordCount: wordCount,
        extractedCharacterCount: characterCount,
        normalizedDocument: {
          documents: normalizedDocuments,
        } as Prisma.InputJsonValue,
        extractedText,
        summary: validationPassed
          ? 'AI review completed. Teacher action is still required before any academic decision.'
          : 'Submission validation failed. AI analysis stages after validation were not executed.',
      },
    })

    await prisma.courseworkAICheck.upsert({
      where: {
        reviewId_checkType: {
          reviewId: review.id,
          checkType: CourseworkAICheckType.SUBMISSION_VALIDATION,
        },
      },
      create: {
        reviewId: review.id,
        checkType: CourseworkAICheckType.SUBMISSION_VALIDATION,
        status: validationPassed ? CourseworkAICheckStatus.PASSED : CourseworkAICheckStatus.FAILED,
        score: validationPassed ? 100 : 0,
        details: {
          issues: validationIssues,
        },
        message: validationPassed
          ? 'Submission validation passed and AI analysis proceeded.'
          : 'Submission validation failed. Later AI stages were skipped.',
      },
      update: {
        status: validationPassed ? CourseworkAICheckStatus.PASSED : CourseworkAICheckStatus.FAILED,
        score: validationPassed ? 100 : 0,
        details: {
          issues: validationIssues,
        },
        message: validationPassed
          ? 'Submission validation passed and AI analysis proceeded.'
          : 'Submission validation failed. Later AI stages were skipped.',
      },
    })

    if (!validationPassed) {
      if (validationIssues.length > 0) {
        await prisma.courseworkAIFinding.createMany({
          data: validationIssues.map((issue) => ({
            reviewId: review.id,
            category: 'VALIDATION',
            severity: issue.severity,
            title: issue.code,
            description: issue.message,
          })),
        })
      }

      await prisma.courseworkAIAudit.create({
        data: {
          reviewId: review.id,
          action: 'AI_REVIEW_CREATED',
          details: {
            trigger: input.trigger,
            validationPassed,
          },
        },
      })

      const completedAt = new Date()
      await prisma.$transaction([
        prisma.courseworkAIReviewJob.update({
          where: { id: job.id },
          data: {
            status: CourseworkAIReviewJobStatus.FAILED,
            failedAt: completedAt,
            completedAt,
            leaseExpiresAt: null,
            errorMessage: validationIssues.map((issue) => issue.message).join(' | '),
            processingTimeMs: Date.now() - startedAt,
          },
        }),
        prisma.courseworkAIReview.update({
          where: { id: review.id },
          data: {
            status: CourseworkAIReviewStatus.FAILED,
            errorCode: VALIDATION_ERROR_CODE,
            errorMessage: validationIssues.map((issue) => issue.message).join(' | '),
            completedAt,
            processingTimeMs: Date.now() - startedAt,
          },
        }),
      ])

      return { reviewId: review.id, versionNumber, validationPassed }
    }

    const primaryDocument = normalizedDocuments[0] ?? {
      headings: extractSectionNames(extractedText),
      paragraphs: extractedText.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean),
      tables: [],
      lists: [],
      references: extractReferencesSection(extractedText).split('\n').map((item) => item.trim()).filter(Boolean),
      images: [],
      captions: [],
      footnotes: [],
      pageNumbers: [],
    }
    const compliance = buildComplianceAnalysis(attempt, primaryDocument, extractedText)
    const similarityMatches = await createSimilarityMatches(attempt, extractedText)
    const highestSimilarity = similarityMatches[0]?.similarityPercent ?? 0
    const grammar = buildGrammarAnalysis(extractedText)
    const citation = buildCitationAnalysis(extractedText)
    const writingRisk = buildWritingRisk(extractedText)
    const rubricSuggestions = buildRubricSuggestions(attempt, extractedText)
    const recommendation = buildRecommendation({
      complianceScore: compliance.complianceScore,
      similarityScore: highestSimilarity,
      grammarScore: grammar.score,
      citationScore: citation.score,
      writingRiskLevel: writingRisk.level,
    })

    const completedAt = new Date()
    await prisma.$transaction([
      prisma.courseworkAIReview.update({
        where: { id: review.id },
        data: {
          status: CourseworkAIReviewStatus.COMPLETED,
          complianceScore: compliance.complianceScore,
          similarityScore: highestSimilarity,
          grammarScore: grammar.score,
          citationScore: citation.score,
          writingRiskLevel: writingRisk.level,
          errorCode: null,
          errorMessage: null,
          completedAt,
          processingTimeMs: Date.now() - startedAt,
          normalizedDocument: primaryDocument as Prisma.InputJsonValue,
        },
      }),
      prisma.courseworkAICheck.createMany({
        data: [
          {
            reviewId: review.id,
            checkType: CourseworkAICheckType.DOCUMENT_PARSING,
            status: CourseworkAICheckStatus.PASSED,
            score: 100,
            details: { parseFailures, documentFormat },
            message: 'Document parsing completed.',
          },
          {
            reviewId: review.id,
            checkType: CourseworkAICheckType.CONTENT_EXTRACTION,
            status: CourseworkAICheckStatus.PASSED,
            score: 100,
            details: { wordCount, characterCount },
            message: 'Content extraction completed.',
          },
          {
            reviewId: review.id,
            checkType: CourseworkAICheckType.ASSIGNMENT_RULES_VALIDATION,
            status: compliance.missingSections.length > 0 || compliance.missingReferences > 0 || compliance.missingRules.length > 0
              ? CourseworkAICheckStatus.WARNING
              : CourseworkAICheckStatus.PASSED,
            score: compliance.complianceScore,
            details: compliance,
            message: 'Assignment rule validation completed.',
          },
          {
            reviewId: review.id,
            checkType: CourseworkAICheckType.SIMILARITY_ANALYSIS,
            status: highestSimilarity >= 45 ? CourseworkAICheckStatus.WARNING : CourseworkAICheckStatus.PASSED,
            score: highestSimilarity,
            details: { matches: similarityMatches.length },
            message: 'Similarity analysis completed.',
          },
          {
            reviewId: review.id,
            checkType: CourseworkAICheckType.AI_WRITING_RISK,
            status: writingRisk.level === CourseworkAIWritingRiskLevel.HIGH ? CourseworkAICheckStatus.WARNING : CourseworkAICheckStatus.PASSED,
            score: writingRisk.score,
            details: writingRisk,
            message: 'Writing-risk analysis completed.',
          },
          {
            reviewId: review.id,
            checkType: CourseworkAICheckType.GRAMMAR_REVIEW,
            status: grammar.score < 60 ? CourseworkAICheckStatus.WARNING : CourseworkAICheckStatus.PASSED,
            score: grammar.score,
            details: { readability: grammar.readability, passiveVoiceCount: grammar.passiveVoiceCount },
            message: 'Grammar review completed.',
          },
          {
            reviewId: review.id,
            checkType: CourseworkAICheckType.CITATION_VALIDATION,
            status: citation.score < 60 ? CourseworkAICheckStatus.WARNING : CourseworkAICheckStatus.PASSED,
            score: citation.score,
            details: { referenceCount: citation.referenceCount, inlineCitationCount: citation.inlineCitationCount, style: citation.style },
            message: 'Citation validation completed.',
          },
          {
            reviewId: review.id,
            checkType: CourseworkAICheckType.RUBRIC_AI_EVALUATION,
            status: rubricSuggestions.length > 0 ? CourseworkAICheckStatus.PASSED : CourseworkAICheckStatus.SKIPPED,
            score: rubricSuggestions.length > 0 ? toPercent(rubricSuggestions.length, rubricSuggestions.length) : 0,
            details: { suggestions: rubricSuggestions.length },
            message: rubricSuggestions.length > 0 ? 'Rubric suggestions generated.' : 'Rubric suggestions skipped because no rubric is attached.',
          },
          {
            reviewId: review.id,
            checkType: CourseworkAICheckType.RECOMMENDATION_GENERATION,
            status: CourseworkAICheckStatus.PASSED,
            score: recommendation.confidence * 100,
            details: recommendation,
            message: 'Recommendation generated.',
          },
        ],
      }),
      prisma.courseworkAIFinding.createMany({
        data: [
          ...compliance.missingSections.map((section) => ({
            reviewId: review.id,
            category: 'COMPLIANCE',
            severity: 'WARNING',
            title: 'MISSING_SECTION',
            description: `Required section missing: ${section}`,
          })),
          ...compliance.missingRules.map((rule) => ({
            reviewId: review.id,
            category: 'COMPLIANCE',
            severity: 'WARNING',
            title: 'MISSING_RULE',
            description: `Requirement not satisfied: ${rule}`,
          })),
          {
            reviewId: review.id,
            category: 'WRITING_RISK',
            severity: writingRisk.level === CourseworkAIWritingRiskLevel.HIGH ? 'WARNING' : 'INFO',
            title: writingRisk.level,
            description: writingRisk.evidence,
          },
        ],
      }),
      ...(similarityMatches.length > 0
        ? [
            prisma.courseworkAISourceMatch.createMany({
              data: similarityMatches.map((match) => ({
                reviewId: review.id,
                matchedStudentId: match.matchedStudentId,
                providerKey: match.providerKey,
                sourceTitle: match.sourceTitle,
                sourceUrl: match.sourceUrl,
                matchedText: match.matchedText,
                similarityPercent: match.similarityPercent,
                sourceType: match.sourceType,
                teacherEvidence: match.teacherEvidence,
                metadata: match.metadata,
              })),
            }),
          ]
        : []),
      ...(rubricSuggestions.length > 0
        ? [
            prisma.courseworkAIRubricSuggestion.createMany({
              data: rubricSuggestions.map((suggestion) => ({
                reviewId: review.id,
                criterionId: suggestion.criterionId,
                suggestedScore: suggestion.suggestedScore,
                confidence: suggestion.confidence,
                reason: suggestion.reason,
                evidenceText: suggestion.evidenceText,
                metadata: suggestion.metadata,
              })),
            }),
          ]
        : []),
      ...(citation.findings.length > 0
        ? [
            prisma.courseworkAICitationFinding.createMany({
              data: citation.findings.map((finding) => ({
                reviewId: review.id,
                citationStyle: citation.style,
                issueType: finding.issueType,
                description: finding.description,
                referenceText: finding.referenceText,
                locationLabel: finding.locationLabel,
              })),
            }),
          ]
        : []),
      ...(grammar.findings.length > 0
        ? [
            prisma.courseworkAIGrammarFinding.createMany({
              data: grammar.findings.map((finding) => ({
                reviewId: review.id,
                issueType: finding.issueType,
                severity: finding.severity,
                sentenceText: finding.sentenceText,
                suggestion: finding.suggestion,
                explanation: finding.explanation,
              })),
            }),
          ]
        : []),
      prisma.courseworkAIRecommendation.create({
        data: {
          reviewId: review.id,
          code: recommendation.code,
          confidence: recommendation.confidence,
          rationale: recommendation.rationale,
          teacherOnly: true,
          metadata: {
            similarityScore: highestSimilarity,
            grammarScore: grammar.score,
            citationScore: citation.score,
            complianceScore: compliance.complianceScore,
          },
        },
      }),
      prisma.courseworkAIAudit.create({
        data: {
          reviewId: review.id,
          action: 'AI_REVIEW_CREATED',
          details: {
            trigger: input.trigger,
            validationPassed,
            highestSimilarity,
            recommendation: recommendation.code,
          },
        },
      }),
      prisma.courseworkAIReviewJob.update({
        where: { id: job.id },
        data: {
          status: CourseworkAIReviewJobStatus.COMPLETED,
          progressPercent: 100,
          leaseExpiresAt: null,
          completedAt,
          processingTimeMs: Date.now() - startedAt,
        },
      }),
    ])

    return { reviewId: review.id, versionNumber, validationPassed }
  } catch (error) {
    const completedAt = new Date()
    await prisma.$transaction([
      prisma.courseworkAIReviewJob.update({
        where: { id: job.id },
        data: {
          status: CourseworkAIReviewJobStatus.FAILED,
          failedAt: completedAt,
          completedAt,
          leaseExpiresAt: null,
          progressPercent: 100,
          errorMessage: error instanceof Error ? error.message : 'AI review failed',
          processingTimeMs: Date.now() - startedAt,
        },
      }),
      prisma.courseworkAIReview.update({
        where: { id: review.id },
        data: {
          status: CourseworkAIReviewStatus.FAILED,
          errorCode: PROCESSING_ERROR_CODE,
          errorMessage: error instanceof Error ? error.message : 'AI review failed',
          completedAt,
          processingTimeMs: Date.now() - startedAt,
        },
      }),
    ])
    throw error
  }
}

export async function appendCourseworkAiAudit(input: {
  reviewId: string
  actorTeacherId?: string | null
  action: 'RELEASED_TO_STUDENT' | 'TEACHER_APPROVE' | 'TEACHER_RETURN' | 'TEACHER_REJECT' | 'TEACHER_MANUAL_REVIEW'
  details?: Record<string, unknown> | null
}) {
  return prisma.courseworkAIAudit.create({
    data: {
      reviewId: input.reviewId,
      actorTeacherId: input.actorTeacherId ?? null,
      action: input.action,
      details: (input.details ?? null) as Prisma.InputJsonValue,
    },
  })
}
