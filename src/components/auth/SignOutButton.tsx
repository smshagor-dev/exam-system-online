'use client'

import { signOut } from 'next-auth/react'

type SignOutButtonProps = {
  className?: string
  children?: React.ReactNode
}

export default function SignOutButton({
  className,
  children = 'Sign out',
}: SignOutButtonProps) {
  const handleSignOut = async () => {
    try {
      await signOut({ redirect: false, callbackUrl: '/login' })
    } finally {
      // Always resolve /login against the browser's current origin so a stale
      // AUTH_URL/NEXTAUTH_URL can never send production users to localhost.
      window.location.replace('/login')
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      className={className}
    >
      {children}
    </button>
  )
}
