import { NextResponse } from 'next/server'
import { QuestionType, UserRole } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { aiEvaluationService } from '@/services/ai-evaluation.service'

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await requireRole(UserRole.SUPER_ADMIN, UserRole.TEACHER)

  try {
    const result = await aiEvaluationService.evaluateAnswer({
      questionText: 'Define polymorphism in object-oriented programming.',
      questionType: QuestionType.SHORT_ANSWER,
      expectedAnswer: 'Polymorphism allows the same interface to represent different underlying forms or implementations.',
      studentAnswer: 'Polymorphism means one interface can work with many implementations.',
      maxMarks: 5,
    })

    return NextResponse.json({
      message: 'AI provider test completed successfully.',
      result,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI provider test failed.' },
      { status: 400 }
    )
  }
}
