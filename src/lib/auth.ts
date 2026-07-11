/**
 * src/lib/auth.ts
 * Authentication configuration using NextAuth v5 with Prisma adapter
 * Role-based access control is enforced server-side here.
 */

import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { isEmailVerificationRequired } from './system-settings'
import { UserRole } from '@prisma/client'
import { z } from 'zod'
import { getAuthSecret } from './auth-secret'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  secret: getAuthSecret(),
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data
        const requireVerification = await isEmailVerificationRequired()

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            role: true,
            isActive: true,
            isEmailVerified: true,
          },
        })

        if (!user || !user.isActive) return null
        if (requireVerification && !user.isEmailVerified) return null

        const valid = await bcrypt.compare(password, user.password)
        if (!valid) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        if (user.id) token.id = user.id
        if (user.role) token.role = user.role
      }
      const userId = (token.id as string | undefined) ?? token.sub
      if (userId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            avatarUrl: true,
            isActive: true,
          },
        })

        if (dbUser) {
          token.id = dbUser.id
          token.name = dbUser.name
          token.email = dbUser.email
          token.role = dbUser.role
          token.avatarUrl = dbUser.avatarUrl ?? null
          token.isActive = dbUser.isActive
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.name = token.name as string
        session.user.email = token.email as string
        session.user.role = token.role as UserRole
        session.user.avatarUrl = (token.avatarUrl as string | null | undefined) ?? null
        session.user.isActive = (token.isActive as boolean | undefined) ?? true
      }
      return session
    },
  },
})

/** Shorthand to get auth in server components / route handlers */
export async function getServerSession() {
  return await auth()
}

/** Require a specific role or list of roles; throws if unauthorized */
export async function requireRole(...roles: UserRole[]) {
  const session = await auth()
  if (!session?.user) {
    throw new Error('UNAUTHORIZED')
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true, role: true },
  })

  if (!dbUser?.isActive) {
    throw new Error('UNAUTHORIZED')
  }
  if (!roles.includes(dbUser.role)) {
    throw new Error('FORBIDDEN')
  }
  return {
    ...session,
    user: {
      ...session.user,
      role: dbUser.role,
      isActive: dbUser.isActive,
    },
  }
}

// Extend NextAuth types
declare module 'next-auth' {
  interface User {
    role: UserRole
  }
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: UserRole
      isActive: boolean
      avatarUrl?: string | null
    }
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string
    role: UserRole
    isActive?: boolean
    avatarUrl?: string | null
  }
}
