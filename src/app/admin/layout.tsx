import { requireRole } from '@/lib/auth'
import AdminShell from '@/components/admin/AdminShell'
import { UserRole } from '@prisma/client'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)

  return (
    <AdminShell
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
      }}
    >
      {children}
    </AdminShell>
  )
}
