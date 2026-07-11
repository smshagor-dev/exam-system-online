import { requireRole } from '@/lib/auth'
import AdminShell from '@/components/admin/AdminShell'
import { UserRole } from '@prisma/client'
import { getBrandingConfig } from '@/lib/system-settings'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let session: Awaited<ReturnType<typeof requireRole>>
  const branding = await getBrandingConfig()

  try {
    session = await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)
  } catch {
    redirect('/')
  }

  return (
    <AdminShell
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        avatarUrl: session.user.avatarUrl ?? null,
      }}
      branding={branding}
    >
      {children}
    </AdminShell>
  )
}
