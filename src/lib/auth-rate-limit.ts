import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

type AuthAction =
  | 'login'
  | 'register'
  | 'forgot-password'
  | 'reset-password'
  | 'verify-account'
  | 'send-verification-code'

type LimitRule = {
  windowMs: number
  max: number
  cooldownMs: number
}

type CounterState = {
  count: number
  resetAt: number
  cooldownUntil: number
}

const AUTH_RATE_LIMITS: Record<AuthAction, { ip: LimitRule; account?: LimitRule }> = {
  login: {
    ip: { windowMs: 15 * 60_000, max: 120, cooldownMs: 10 * 60_000 },
    account: { windowMs: 15 * 60_000, max: 30, cooldownMs: 15 * 60_000 },
  },
  register: {
    ip: { windowMs: 60 * 60_000, max: 12, cooldownMs: 30 * 60_000 },
    account: { windowMs: 60 * 60_000, max: 3, cooldownMs: 60 * 60_000 },
  },
  'forgot-password': {
    ip: { windowMs: 30 * 60_000, max: 8, cooldownMs: 30 * 60_000 },
    account: { windowMs: 30 * 60_000, max: 4, cooldownMs: 30 * 60_000 },
  },
  'reset-password': {
    ip: { windowMs: 30 * 60_000, max: 10, cooldownMs: 30 * 60_000 },
    account: { windowMs: 30 * 60_000, max: 5, cooldownMs: 30 * 60_000 },
  },
  'verify-account': {
    ip: { windowMs: 30 * 60_000, max: 12, cooldownMs: 20 * 60_000 },
    account: { windowMs: 30 * 60_000, max: 6, cooldownMs: 20 * 60_000 },
  },
  'send-verification-code': {
    ip: { windowMs: 30 * 60_000, max: 8, cooldownMs: 30 * 60_000 },
    account: { windowMs: 30 * 60_000, max: 4, cooldownMs: 30 * 60_000 },
  },
}

const memoryStore = globalThis.__examflowAuthRateLimitStore ?? new Map<string, CounterState>()
globalThis.__examflowAuthRateLimitStore = memoryStore

declare global {
  var __examflowAuthRateLimitStore: Map<string, CounterState> | undefined
}

function normalizeAccountKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null
}

function updateCounter(key: string, rule: LimitRule, now: number) {
  const existing = memoryStore.get(key)

  if (!existing || existing.resetAt <= now) {
    const nextState: CounterState = {
      count: 1,
      resetAt: now + rule.windowMs,
      cooldownUntil: 0,
    }
    memoryStore.set(key, nextState)
    return { blocked: false, retryAfterMs: rule.windowMs, state: nextState }
  }

  if (existing.cooldownUntil > now) {
    return { blocked: true, retryAfterMs: existing.cooldownUntil - now, state: existing }
  }

  existing.count += 1
  if (existing.count > rule.max) {
    existing.cooldownUntil = now + rule.cooldownMs
    memoryStore.set(key, existing)
    return { blocked: true, retryAfterMs: rule.cooldownMs, state: existing }
  }

  memoryStore.set(key, existing)
  return { blocked: false, retryAfterMs: existing.resetAt - now, state: existing }
}

export function getClientIpAddress(req: Request | NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown'
  }

  return (
    req.headers.get('x-real-ip')?.trim() ||
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-client-ip')?.trim() ||
    'unknown'
  )
}

async function writeAuthAuditLog(input: {
  userId?: string | null
  action: string
  ipAddress: string
  details: Record<string, unknown>
}) {
  if (!input.userId) return

  await prisma.activityLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      ipAddress: input.ipAddress,
      details: JSON.stringify(input.details),
    },
  }).catch(() => {})
}

export async function enforceAuthRateLimit(input: {
  req: Request | NextRequest
  action: AuthAction
  accountKey?: string | null
  userId?: string | null
}) {
  const rules = AUTH_RATE_LIMITS[input.action]
  const now = Date.now()
  const ipAddress = getClientIpAddress(input.req)

  const ipOutcome = updateCounter(`ip:${input.action}:${ipAddress}`, rules.ip, now)
  if (ipOutcome.blocked) {
    await writeAuthAuditLog({
      userId: input.userId,
      action: `auth.rate_limit.${input.action}.ip`,
      ipAddress,
      details: {
        scope: 'ip',
        retryAfterMs: ipOutcome.retryAfterMs,
      },
    })

    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil(ipOutcome.retryAfterMs / 1000))),
        },
      }
    )
  }

  const normalizedAccountKey = normalizeAccountKey(input.accountKey)
  if (!normalizedAccountKey || !rules.account) {
    return null
  }

  const accountOutcome = updateCounter(
    `account:${input.action}:${normalizedAccountKey}`,
    rules.account,
    now
  )

  if (!accountOutcome.blocked) {
    return null
  }

  await writeAuthAuditLog({
    userId: input.userId,
    action: `auth.rate_limit.${input.action}.account`,
    ipAddress,
    details: {
      scope: 'account',
      accountKey: normalizedAccountKey,
      retryAfterMs: accountOutcome.retryAfterMs,
    },
  })

  return NextResponse.json(
    { error: 'Too many requests. Please wait before trying again.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, Math.ceil(accountOutcome.retryAfterMs / 1000))),
      },
    }
  )
}
