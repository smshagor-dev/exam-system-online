import mammoth from 'mammoth'
import path from 'path'
import { readFile } from 'fs/promises'

export type CourseworkNormalizedDocument = {
  headings: string[]
  paragraphs: string[]
  tables: string[]
  lists: string[]
  references: string[]
  images: string[]
  captions: string[]
  footnotes: string[]
  pageNumbers: string[]
}

export type CourseworkParsedDocument = {
  format: string
  text: string
  normalizedDocument: CourseworkNormalizedDocument
}

function buildNormalizedDocument(text: string, extension: string): CourseworkNormalizedDocument {
  return {
    headings: extractSectionNames(text),
    paragraphs: text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean),
    tables: extension === 'txt' || extension === 'md' || extension === 'markdown'
      ? text.split('\n').filter((line) => line.includes('|'))
      : [],
    lists: extension === 'txt' || extension === 'md' || extension === 'markdown'
      ? text.split('\n').filter((line) => /^\s*[-*0-9.]+\s+/.test(line))
      : [],
    references: extractReferencesSection(text).split('\n').map((item) => item.trim()).filter(Boolean),
    images: [],
    captions: [],
    footnotes: [],
    pageNumbers: [],
  }
}

export function countCourseworkWords(text: string) {
  return (text.match(/\b[\p{L}\p{N}][\p{L}\p{N}'_-]*\b/gu) ?? []).length
}

export function extractReferencesSection(text: string) {
  const match = text.match(/(?:^|\n)(references|bibliography|works cited)\s*\n([\s\S]*)$/i)
  return match?.[2]?.trim() ?? ''
}

export function extractSectionNames(text: string) {
  const headingMatches = text.match(/^(#{1,6}\s+.+|[A-Z][A-Z\s]{3,}|[A-Z][A-Za-z0-9 ,:()-]{2,})$/gm) ?? []
  return headingMatches.map((heading) => heading.replace(/^#+\s*/, '').trim()).filter(Boolean)
}

export async function extractCourseworkDocumentFromBuffer(file: {
  fileName: string
  extension?: string | null
  mimeType?: string | null
  bytes: Buffer
}) {
  const extension = (file.extension || file.fileName.split('.').pop() || '').toLowerCase()

  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer: file.bytes })
    const text = result.value.trim()
    return {
      format: 'DOCX',
      text,
      normalizedDocument: buildNormalizedDocument(text, extension),
    } satisfies CourseworkParsedDocument
  }

  if (extension === 'pdf') {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: file.bytes })
    try {
      const parsed = await parser.getText()
      const text = parsed.text.trim()
      return {
        format: 'PDF',
        text,
        normalizedDocument: buildNormalizedDocument(text, extension),
      } satisfies CourseworkParsedDocument
    } finally {
      await parser.destroy()
    }
  }

  if (extension === 'txt' || extension === 'md' || extension === 'markdown') {
    const text = file.bytes.toString('utf8').trim()
    return {
      format: extension === 'txt' ? 'TXT' : 'MARKDOWN',
      text,
      normalizedDocument: buildNormalizedDocument(text, extension),
    } satisfies CourseworkParsedDocument
  }

  return {
    format: extension.toUpperCase() || 'UNKNOWN',
    text: '',
    normalizedDocument: buildNormalizedDocument('', extension),
  } satisfies CourseworkParsedDocument
}

export async function extractCourseworkDocumentFromStoredFile(file: {
  fileName: string
  extension: string | null
  mimeType: string
  fileUrl: string
}) {
  const absolutePath = path.join(process.cwd(), 'public', file.fileUrl.replace(/^\//, '').replace(/\//g, path.sep))
  const bytes = await readFile(absolutePath)
  return extractCourseworkDocumentFromBuffer({
    fileName: file.fileName,
    extension: file.extension,
    mimeType: file.mimeType,
    bytes,
  })
}
