import { auth } from '@/lib/auth'
import { teacherHasCourseworkPermissionForPublication } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ reviewId: string }>
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function buildMinimalPdf(lines: string[]) {
  const safeLines = lines.map((line) => escapePdfText(line.slice(0, 110)))
  const content = ['BT', '/F1 10 Tf', '50 780 Td']
  safeLines.forEach((line, index) => {
    content.push(index === 0 ? `(${line}) Tj` : `0 -14 Td (${line}) Tj`)
  })
  content.push('ET')
  const stream = content.join('\n')

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
  ]

  let offset = '%PDF-1.4\n'.length
  const xrefOffsets = ['0000000000 65535 f ']
  let body = '%PDF-1.4\n'

  for (const object of objects) {
    xrefOffsets.push(`${String(offset).padStart(10, '0')} 00000 n `)
    body += `${object}\n`
    offset = Buffer.byteLength(body, 'utf8')
  }

  const xrefPosition = offset
  body += `xref\n0 ${objects.length + 1}\n${xrefOffsets.join('\n')}\n`
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF`

  return Buffer.from(body, 'utf8')
}

export async function GET(request: Request, context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can download AI review reports' }, { status: 403 })
  }

  const { reviewId } = await context.params
  const review = await prisma.courseworkAIReview.findUnique({
    where: { id: reviewId },
    include: {
      attempt: {
        include: {
          student: {
            include: {
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      },
      publication: {
        select: {
          id: true,
          title: true,
        },
      },
      checks: true,
      findings: true,
      sourceMatches: true,
      rubricSuggestions: true,
      citationFindings: true,
      grammarFindings: true,
      recommendations: true,
      audits: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!review) {
    return NextResponse.json({ error: 'AI review not found' }, { status: 404 })
  }

  const allowed = await teacherHasCourseworkPermissionForPublication(
    { userId: session.user.id, role: session.user.role },
    'coursework.review',
    review.publicationId
  )
  if (!allowed) {
    return NextResponse.json({ error: 'You do not have permission to download this report' }, { status: 403 })
  }

  const url = new URL(request.url)
  const format = (url.searchParams.get('format') || 'json').toLowerCase()
  const payload = {
    review: {
      id: review.id,
      versionNumber: review.versionNumber,
      status: review.status,
      publicationTitle: review.publication.title,
      studentName: review.attempt.student.user.name,
      studentEmail: review.attempt.student.user.email,
      validationPassed: review.validationPassed,
      complianceScore: review.complianceScore,
      similarityScore: review.similarityScore,
      grammarScore: review.grammarScore,
      citationScore: review.citationScore,
      writingRiskLevel: review.writingRiskLevel,
      summary: review.summary,
      createdAt: review.createdAt.toISOString(),
    },
    checks: review.checks,
    findings: review.findings,
    similarity: review.sourceMatches,
    grammar: review.grammarFindings,
    citation: review.citationFindings,
    rubric: review.rubricSuggestions,
    recommendations: review.recommendations,
    auditHistory: review.audits,
  }

  if (format === 'csv') {
    const rows = [
      ['section', 'label', 'value'],
      ['review', 'publicationTitle', review.publication.title],
      ['review', 'studentName', review.attempt.student.user.name],
      ['review', 'complianceScore', String(review.complianceScore ?? '')],
      ['review', 'similarityScore', String(review.similarityScore ?? '')],
      ['review', 'grammarScore', String(review.grammarScore ?? '')],
      ['review', 'citationScore', String(review.citationScore ?? '')],
      ['review', 'writingRiskLevel', review.writingRiskLevel],
      ...review.recommendations.map((item) => ['recommendation', item.code, item.rationale]),
      ...review.sourceMatches.map((item) => ['similarity', item.sourceTitle, item.similarityPercent.toFixed(2)]),
    ]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    return new NextResponse(rows, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="coursework-ai-review-${review.id}.csv"`,
      },
    })
  }

  if (format === 'pdf') {
    const pdf = buildMinimalPdf([
      `AI Review Report - ${review.publication.title}`,
      `Student: ${review.attempt.student.user.name} <${review.attempt.student.user.email}>`,
      `Version: ${review.versionNumber}  Status: ${review.status}`,
      `Compliance: ${review.complianceScore ?? 'n/a'}  Similarity: ${review.similarityScore ?? 'n/a'}`,
      `Grammar: ${review.grammarScore ?? 'n/a'}  Citation: ${review.citationScore ?? 'n/a'}`,
      `Writing risk: ${review.writingRiskLevel}`,
      `Recommendation: ${review.recommendations[0]?.code ?? 'n/a'}`,
      review.recommendations[0]?.rationale ?? '',
    ])

    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="coursework-ai-review-${review.id}.pdf"`,
      },
    })
  }

  return NextResponse.json(payload, {
    headers: {
      'Content-Disposition': `attachment; filename="coursework-ai-review-${review.id}.json"`,
    },
  })
}
