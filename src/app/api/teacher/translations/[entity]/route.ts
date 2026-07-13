import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getEntityList, type TranslationEntity } from '@/lib/phase5-translations'

type RouteContext = {
  params: Promise<{
    entity: string
  }>
}

const SUPPORTED_ENTITIES: TranslationEntity[] = [
  'questions',
  'question-options',
  'exams',
  'coursework-rules',
  'coursework-assignments',
  'ebooks',
]

function isSupportedEntity(value: string): value is TranslationEntity {
  return SUPPORTED_ENTITIES.includes(value as TranslationEntity)
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { entity } = await params
  if (!isSupportedEntity(entity)) {
    return NextResponse.json({ error: 'Unsupported translation entity' }, { status: 404 })
  }

  const { searchParams } = new URL(req.url)

  try {
    const items = await getEntityList(
      { userId: session.user.id, role: session.user.role },
      entity,
      {
        languageId: searchParams.get('languageId'),
        missingOnly: searchParams.get('missingOnly') === 'true',
        departmentId: searchParams.get('departmentId'),
      }
    )

    return NextResponse.json({ entity, items })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load translations'
    const status = message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
