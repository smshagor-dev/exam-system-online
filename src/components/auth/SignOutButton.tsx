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
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/login' })}
      className={className}
    >
      {children}
    </button>
  )
}
