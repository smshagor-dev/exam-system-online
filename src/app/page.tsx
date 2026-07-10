import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function HomePage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isActive: true },
  })

  if (!user?.isActive) {
    redirect('/login?blocked=1')
  }

  // Redirect based on role
  switch (user.role) {
    case 'SUPER_ADMIN':
    case 'DEPARTMENT_ADMIN':
      redirect('/admin/dashboard')
    case 'TEACHER':
      redirect('/teacher/dashboard')
    case 'STUDENT':
      redirect('/student/dashboard')
    default:
      redirect('/login')
  }
}
