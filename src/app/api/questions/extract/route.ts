import { auth } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 10 * 1024 * 1024

function normalizeExtractedText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function getFileExtension(file: File) {
  return file.name.split('.').pop()?.toLowerCase() ?? ''
}

function resolveOcrLanguage(rawLanguage: string | null) {
  const value = rawLanguage?.trim().toLowerCase()

  if (!value) return 'eng'

  const mapped: Record<string, string> = {
    en: 'eng',
    eng: 'eng',
    english: 'eng',
    bn: 'ben',
    ben: 'ben',
    bengali: 'ben',
    bangla: 'ben',
    ar: 'ara',
    ara: 'ara',
    arabic: 'ara',
    hi: 'hin',
    hin: 'hin',
    hindi: 'hin',
    ur: 'urd',
    urd: 'urd',
    urdu: 'urd',
  }

  return mapped[value] ?? 'eng'
}

async function extractFromPdf(buffer: Buffer) {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })

  try {
    const result = await parser.getText()
    return normalizeExtractedText(result.text)
  } finally {
    await parser.destroy()
  }
}

async function extractFromImage(buffer: Buffer, ocrLanguage: string) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(ocrLanguage, 1)

  try {
    const result = await worker.recognize(buffer)
    return normalizeExtractedText(result.data.text)
  } finally {
    await worker.terminate()
  }
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== UserRole.TEACHER) {
    return NextResponse.json({ error: 'Only teachers can extract question text' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const ocrLanguage = resolveOcrLanguage(String(formData.get('ocrLanguage') || ''))

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Please upload a file' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File size must be 10MB or less' }, { status: 400 })
  }

  const extension = getFileExtension(file)
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    let text = ''
    let sourceType = 'text'

    if (file.type.startsWith('image/')) {
      sourceType = 'image'
      text = await extractFromImage(buffer, ocrLanguage)
    } else if (file.type === 'application/pdf' || extension === 'pdf') {
      sourceType = 'pdf'
      text = await extractFromPdf(buffer)
    } else if (
      file.type.startsWith('text/') ||
      ['txt', 'md', 'csv'].includes(extension)
    ) {
      sourceType = 'text'
      text = normalizeExtractedText(buffer.toString('utf8'))
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please use image, PDF, TXT, or MD.' },
        { status: 400 },
      )
    }

    if (!text) {
      return NextResponse.json(
        { error: 'No readable text was found in the uploaded file' },
        { status: 422 },
      )
    }

    return NextResponse.json({
      fileName: file.name,
      sourceType,
      text,
    })
  } catch (error) {
    console.error('Question extraction failed:', error)
    return NextResponse.json(
      { error: 'Failed to extract text from the uploaded file' },
      { status: 500 },
    )
  }
}
