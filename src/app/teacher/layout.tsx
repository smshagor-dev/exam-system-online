import { requireRole } from '@/lib/auth'
import TeacherShell from '@/components/teacher/TeacherShell'
import { UserRole } from '@prisma/client'
import { getBrandingConfig } from '@/lib/system-settings'

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const [session, branding] = await Promise.all([
    requireRole(UserRole.TEACHER),
    getBrandingConfig(),
  ])

  return (
    <TeacherShell
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        avatarUrl: session.user.avatarUrl ?? null,
      }}
      branding={branding}
    >
      {children}
    </TeacherShell>
  )
}
