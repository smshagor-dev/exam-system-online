import ChangePasswordForm from '@/components/account/ChangePasswordForm'
import { requireRole } from '@/lib/auth'
import { UserRole } from '@prisma/client'

export default async function AdminChangePasswordPage() {
  await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)

  return (
    <ChangePasswordForm
      title="Security"
      description="Change your account password."
    />
  )
}
