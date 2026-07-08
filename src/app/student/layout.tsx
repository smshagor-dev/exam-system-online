import StudentShell from '@/components/student/StudentShell'
import { requireRole } from '@/lib/auth'
import { UserRole } from '@prisma/client'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(UserRole.STUDENT)

  return (
    <StudentShell
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
      }}
    >
      {children}
    </StudentShell>
  )
}
