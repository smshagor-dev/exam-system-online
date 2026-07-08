import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'

export default async function HomePage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Redirect based on role
  switch (session.user.role) {
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
