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
import { UserRole } from '@prisma/client'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as any,
  session: { strategy: 'jwt' },
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

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            role: true,
            isActive: true,
          },
        })

        if (!user || !user.isActive) return null

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
        if ((user as any).role) token.role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
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
  if (!roles.includes(session.user.role as UserRole)) {
    throw new Error('FORBIDDEN')
  }
  return session
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
    }
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id: string
    role: UserRole
  }
}
