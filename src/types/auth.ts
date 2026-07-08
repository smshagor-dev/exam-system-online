/**
 * src/types/auth.ts
 * Authentication and session type extensions.
 */

import { UserRole } from '@prisma/client'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: UserRole
}

export interface AuthSession {
  user: SessionUser
  expires: string
}

export type PermissionLevel = 'super_admin' | 'department_admin' | 'teacher' | 'student'

export function roleToPermissionLevel(role: UserRole): PermissionLevel {
  switch (role) {
    case UserRole.SUPER_ADMIN: return 'super_admin'
    case UserRole.DEPARTMENT_ADMIN: return 'department_admin'
    case UserRole.TEACHER: return 'teacher'
    case UserRole.STUDENT: return 'student'
  }
}
