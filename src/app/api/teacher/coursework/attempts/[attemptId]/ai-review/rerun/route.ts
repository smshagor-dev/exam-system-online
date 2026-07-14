import { handleCourseworkAiReviewRerun } from '../handle-rerun'

type RouteContext = {
  params: Promise<{ attemptId: string }>
}

export async function POST(_: Request, context: RouteContext) {
  const { attemptId } = await context.params
  return handleCourseworkAiReviewRerun(attemptId)
}
