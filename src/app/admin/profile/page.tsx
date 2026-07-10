import ProfileEditor from '@/components/account/ProfileEditor'
import { requireRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

export default async function AdminProfilePage() {
  const session = await requireRole(UserRole.SUPER_ADMIN, UserRole.DEPARTMENT_ADMIN)
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      role: true,
      avatarUrl: true,
    },
  })

  if (!user) {
    throw new Error('User not found')
  }

  return (
    <ProfileEditor
      title="Admin Profile"
      description="Update your account details and profile image."
      initialUser={user}
    />
  )
}
