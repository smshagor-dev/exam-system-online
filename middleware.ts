/**
 * middleware.ts
 * Next.js Edge Middleware protects page routes before they render.
 *
 * API routes are excluded here because they already enforce auth server-side,
 * and the auth config imports Node-only modules that should not run in Edge.
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/verify-account']

export default auth((req) => {
  const { nextUrl, auth: session } = req as any
  const pathname = nextUrl.pathname

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  if (!session?.user) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (session.user.isActive === false) {
    return NextResponse.redirect(new URL('/login?blocked=1', req.url))
  }

  const role = session.user.role

  if (pathname.startsWith('/admin') && role !== 'SUPER_ADMIN' && role !== 'DEPARTMENT_ADMIN') {
    return NextResponse.redirect(new URL('/', req.url))
  }

  if (pathname.startsWith('/teacher') && role !== 'TEACHER') {
    return NextResponse.redirect(new URL('/', req.url))
  }

  if (pathname.startsWith('/student') && role !== 'STUDENT') {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
