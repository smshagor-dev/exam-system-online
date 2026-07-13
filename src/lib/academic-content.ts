type LanguageScopedTranslation = {
  languageId: string
  archivedAt?: Date | null
  status?: string | null
}

type ExamTranslationLike = LanguageScopedTranslation & {
  title: string
  description?: string | null
  instructions?: string | null
}

type QuestionTranslationLike = LanguageScopedTranslation & {
  text: string
  expectedAnswer?: string | null
  explanation?: string | null
  keywords?: string | null
}

type QuestionOptionTranslationLike = LanguageScopedTranslation & {
  text: string
}

type CourseworkRuleTranslationLike = LanguageScopedTranslation & {
  rules: string
}

type CourseworkAssignmentTranslationLike = LanguageScopedTranslation & {
  title: string
  rules?: string | null
}

type EbookTranslationLike = LanguageScopedTranslation & {
  title: string
  description?: string | null
}

export class MissingAcademicTranslationError extends Error {
  constructor(entity: string, languageId: string) {
    super(`Missing ${entity} translation for language ${languageId}`)
    this.name = 'MissingAcademicTranslationError'
  }
}

export function serializeKeywords(keywords?: string[] | null): string | null {
  if (!keywords || keywords.length === 0) {
    return null
  }

  return JSON.stringify(keywords)
}

export function parseKeywords(keywords?: string | null): string[] {
  if (!keywords) {
    return []
  }

  try {
    const parsed = JSON.parse(keywords)
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : []
  } catch {
    return []
  }
}

export function dedupeTranslations<T extends LanguageScopedTranslation>(translations: T[]): T[] {
  const byLanguage = new Map<string, T>()

  for (const translation of translations) {
    byLanguage.set(translation.languageId, translation)
  }

  return [...byLanguage.values()]
}

export function findTranslation<T extends LanguageScopedTranslation>(
  translations: T[] | undefined,
  languageId: string
): T | null {
  return (
    translations?.find(
      (translation) =>
        translation.languageId === languageId &&
        !translation.archivedAt &&
        translation.status !== 'ARCHIVED'
    ) ?? null
  )
}

export function requireTranslation<T extends LanguageScopedTranslation>(
  entity: string,
  translations: T[] | undefined,
  languageId: string
): T {
  const translation = findTranslation(translations, languageId)
  if (!translation) {
    throw new MissingAcademicTranslationError(entity, languageId)
  }

  return translation
}

export function resolveExamTranslation<T extends { languageId: string; title: string; description?: string | null; instructions?: string | null; translations?: ExamTranslationLike[] }>(
  exam: T,
  languageId = exam.languageId
) {
  const translation = findTranslation(exam.translations, languageId)

  return {
    ...exam,
    title: translation?.title ?? exam.title,
    description: translation?.description ?? exam.description ?? null,
    instructions: translation?.instructions ?? exam.instructions ?? null,
  }
}

export function resolveQuestionTranslation<T extends { languageId: string; text: string; expectedAnswer?: string | null; explanation?: string | null; keywords?: string | null; translations?: QuestionTranslationLike[] }>(
  question: T,
  languageId = question.languageId
) {
  const translation = findTranslation(question.translations, languageId)

  return {
    ...question,
    text: translation?.text ?? question.text,
    expectedAnswer: translation?.expectedAnswer ?? question.expectedAnswer ?? null,
    explanation: translation?.explanation ?? question.explanation ?? null,
    keywords: translation?.keywords ?? question.keywords ?? null,
  }
}

export function resolveQuestionOptionTranslation<T extends { text: string; translations?: QuestionOptionTranslationLike[] }>(
  option: T,
  languageId: string
) {
  const translation = findTranslation(option.translations, languageId)

  return {
    ...option,
    text: translation?.text ?? option.text,
  }
}

export function resolveCourseworkRuleTranslation<T extends { languageId: string; rules: string; translations?: CourseworkRuleTranslationLike[] }>(
  rule: T,
  languageId = rule.languageId
) {
  const translation = findTranslation(rule.translations, languageId)

  return {
    ...rule,
    rules: translation?.rules ?? rule.rules,
  }
}

export function resolveCourseworkAssignmentTranslation<T extends { languageId: string; title: string; rules?: string | null; translations?: CourseworkAssignmentTranslationLike[] }>(
  assignment: T,
  languageId = assignment.languageId
) {
  const translation = findTranslation(assignment.translations, languageId)

  return {
    ...assignment,
    title: translation?.title ?? assignment.title,
    rules: translation?.rules ?? assignment.rules ?? null,
  }
}

export function resolveEbookTranslation<T extends { languageId: string; title: string; description?: string | null; translations?: EbookTranslationLike[] }>(
  ebook: T,
  languageId = ebook.languageId
) {
  const translation = findTranslation(ebook.translations, languageId)

  return {
    ...ebook,
    title: translation?.title ?? ebook.title,
    description: translation?.description ?? ebook.description ?? null,
  }
}
