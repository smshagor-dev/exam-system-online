export type QuestionContentMode = 'TEXT' | 'TEXT_CODE'
export type QuestionAnswerMode = 'TEXT' | 'CODE'

export type QuestionCodeMetadata = {
  contentMode: QuestionContentMode
  codeContent: string
  codeLanguage: string
  answerMode: QuestionAnswerMode
  answerCodeLanguage: string
  answerStarterCode: string
}

export const CODE_LANGUAGES = [
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'java', label: 'Java' },
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'text', label: 'Plain Text' },
] as const

const META_PATTERN = /<!--EXAMFLOW_CODE_META:([^]*?)-->/g

export const DEFAULT_QUESTION_CODE_METADATA: QuestionCodeMetadata = {
  contentMode: 'TEXT',
  codeContent: '',
  codeLanguage: 'cpp',
  answerMode: 'TEXT',
  answerCodeLanguage: 'cpp',
  answerStarterCode: '',
}

export function isSupportedCodeLanguage(value: string) {
  return CODE_LANGUAGES.some((language) => language.value === value)
}

export function stripQuestionCodeMetadata(text: string) {
  return text.replace(META_PATTERN, '').trim()
}

export function embedQuestionCodeMetadata(
  text: string,
  metadata: Partial<QuestionCodeMetadata>
) {
  const cleanText = stripQuestionCodeMetadata(text)
  const normalized: QuestionCodeMetadata = {
    ...DEFAULT_QUESTION_CODE_METADATA,
    ...metadata,
    codeContent: metadata.codeContent?.trimEnd() ?? '',
    answerStarterCode: metadata.answerStarterCode?.trimEnd() ?? '',
  }

  const needsMetadata =
    normalized.contentMode === 'TEXT_CODE' ||
    normalized.answerMode === 'CODE' ||
    normalized.codeContent.length > 0 ||
    normalized.answerStarterCode.length > 0

  if (!needsMetadata) {
    return cleanText
  }

  const encoded = encodeURIComponent(JSON.stringify(normalized))
  return `${cleanText}\n<!--EXAMFLOW_CODE_META:${encoded}-->`
}

export function parseQuestionCodeMetadata(text: string) {
  const matches = Array.from(text.matchAll(META_PATTERN))
  const marker = matches.at(-1)?.[1]
  let metadata = DEFAULT_QUESTION_CODE_METADATA

  if (marker) {
    try {
      const parsed = JSON.parse(decodeURIComponent(marker)) as Partial<QuestionCodeMetadata>
      metadata = {
        ...DEFAULT_QUESTION_CODE_METADATA,
        ...parsed,
        contentMode: parsed.contentMode === 'TEXT_CODE' ? 'TEXT_CODE' : 'TEXT',
        answerMode: parsed.answerMode === 'CODE' ? 'CODE' : 'TEXT',
        codeLanguage: isSupportedCodeLanguage(String(parsed.codeLanguage ?? ''))
          ? String(parsed.codeLanguage)
          : DEFAULT_QUESTION_CODE_METADATA.codeLanguage,
        answerCodeLanguage: isSupportedCodeLanguage(String(parsed.answerCodeLanguage ?? ''))
          ? String(parsed.answerCodeLanguage)
          : DEFAULT_QUESTION_CODE_METADATA.answerCodeLanguage,
        codeContent: typeof parsed.codeContent === 'string' ? parsed.codeContent : '',
        answerStarterCode:
          typeof parsed.answerStarterCode === 'string' ? parsed.answerStarterCode : '',
      }
    } catch {
      metadata = DEFAULT_QUESTION_CODE_METADATA
    }
  }

  return {
    text: stripQuestionCodeMetadata(text),
    metadata: {
      ...metadata,
      // Compatibility alias for consumers that use the shorter name.
      starterCode: metadata.answerStarterCode,
    },
  }
}
