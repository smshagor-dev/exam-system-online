import { requireRole } from '@/lib/auth'
import TeacherShell from '@/components/teacher/TeacherShell'
import { UserRole } from '@prisma/client'

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(UserRole.TEACHER)

  return (
    <TeacherShell
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
      }}
    >
      {children}
    </TeacherShell>
  )
}
