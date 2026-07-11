import StudentShell from '@/components/student/StudentShell'
import { requireRole } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import { getBrandingConfig } from '@/lib/system-settings'
import { redirect } from 'next/navigation'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  let session: Awaited<ReturnType<typeof requireRole>>
  const branding = await getBrandingConfig()

  try {
    session = await requireRole(UserRole.STUDENT)
  } catch {
    redirect('/')
  }

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
