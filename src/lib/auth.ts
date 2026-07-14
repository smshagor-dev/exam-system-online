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

type AppToken = {
  id?: string
  role?: UserRole
  avatarUrl?: string | null
  isActive?: boolean
  name?: string | null
  email?: string | null
  sub?: string
}

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
      const appToken = token as typeof token & AppToken
      if (user) {
        if (user.id) appToken.id = user.id
        if (user.role) appToken.role = user.role
      }
      const userId = appToken.id ?? appToken.sub
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
          appToken.id = dbUser.id
          appToken.name = dbUser.name
          appToken.email = dbUser.email
          appToken.role = dbUser.role
          appToken.avatarUrl = dbUser.avatarUrl ?? null
          appToken.isActive = dbUser.isActive
        }
      }
      return appToken
    },
    async session({ session, token }) {
      const appToken = token as typeof token & AppToken
      if (appToken) {
        session.user.id = appToken.id as string
        session.user.name = appToken.name as string
        session.user.email = appToken.email as string
        session.user.role = appToken.role as UserRole
        session.user.avatarUrl = appToken.avatarUrl ?? null
        session.user.isActive = appToken.isActive ?? true
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
