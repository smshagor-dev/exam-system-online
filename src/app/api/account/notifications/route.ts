import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        title: true,
        message: true,
        type: true,
        link: true,
        isRead: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({
      where: { userId, isRead: false },
    }),
  ])

  return NextResponse.json({ notifications, unreadCount })
}

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { id?: unknown; markAll?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const userId = session.user.id

  if (body.markAll === true) {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    })

    return NextResponse.json({ updated: result.count })
  }

  if (typeof body.id !== 'string' || body.id.length === 0) {
    return NextResponse.json({ error: 'Notification id is required' }, { status: 400 })
  }

  const result = await prisma.notification.updateMany({
    where: { id: body.id, userId },
    data: { isRead: true },
  })

  if (result.count === 0) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
  }

  return NextResponse.json({ updated: result.count })
}
