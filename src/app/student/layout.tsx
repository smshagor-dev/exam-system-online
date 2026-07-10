import StudentShell from '@/components/student/StudentShell'
import { requireRole } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import { getBrandingConfig } from '@/lib/system-settings'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const [session, branding] = await Promise.all([
    requireRole(UserRole.STUDENT),
    getBrandingConfig(),
  ])

  return (
    <StudentShell
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        avatarUrl: session.user.avatarUrl ?? null,
      }}
      branding={branding}
    >
      {children}
    </StudentShell>
  )
}
