export function getAuthSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET

  if (!secret) {
    throw new Error('Missing AUTH_SECRET or NEXTAUTH_SECRET')
  }

  return secret
}
