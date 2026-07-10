import { requireRole } from '@/lib/auth'
import AdminShell from '@/components/admin/AdminShell'
import { UserRole } from '@prisma/client'
import { getBrandingConfig } from '@/lib/system-settings'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [session, branding] = await Promise.all([
    requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN),
    getBrandingConfig(),
  ])

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
