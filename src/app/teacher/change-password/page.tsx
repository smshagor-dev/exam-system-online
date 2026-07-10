import ChangePasswordForm from '@/components/account/ChangePasswordForm'
import { requireRole } from '@/lib/auth'
import { UserRole } from '@prisma/client'

export default async function TeacherChangePasswordPage() {
  await requireRole(UserRole.TEACHER)

  return (
    <ChangePasswordForm
      title="Security"
      description="Change your account password."
    />
  )
}
