import * as Sentry from '@sentry/node'
import type { ErrorEvent } from '@sentry/node'
import { IS_DEVELOPMENT, NODE_ENV, SENTRY_DSN } from '@/settings'

/**
 * Error tracking for the server. This app handles money transfers, so the rule is that Sentry
 * only ever receives the error, the stack and a user id: never request bodies, headers, cookies,
 * emails or the personal data (cedula, phones, accounts, amounts) that travel in them.
 *
 * Guards:
 * - Disabled in development and when SENTRY_DSN is missing.
 * - SENTRY_ENABLED=false turns it off without touching the DSN.
 * - sendDefaultPii is off and tracing/profiling are not enabled.
 * - beforeSend strips request data, cookies, headers, query strings and user details.
 * - Only 5xx errors reach Sentry: setupExpressErrorHandler ignores 4xx by default.
 */
export const SENTRY_ENABLED = !IS_DEVELOPMENT && !!SENTRY_DSN && process.env.SENTRY_ENABLED !== 'false'

// Keys whose values must never leave the server, matched case-insensitively and by substring
const SENSITIVE_KEY = /pass|token|secret|authorization|cookie|cedula|beneficiary|phone|telefono|account|cuenta|email|amount|monto|iban|card/i

const redact = (value: unknown, depth = 0): unknown => {
  if (depth > 5 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[Filtered]' : redact(val, depth + 1),
    ])
  )
}

export const scrubEvent = (event: ErrorEvent): ErrorEvent => {
  if (event.request) {
    // Keep method and path (useful to locate the failing endpoint); drop everything user-provided
    const { method, url } = event.request
    event.request = { method, url: url?.split('?')[0] }
  }

  // Only the id identifies the user; email, username and IP are dropped
  if (event.user) {
    event.user = event.user.id ? { id: event.user.id } : undefined
  }

  if (event.extra) event.extra = redact(event.extra) as typeof event.extra
  if (event.contexts) event.contexts = redact(event.contexts) as typeof event.contexts

  // Breadcrumbs can carry query strings and log messages with personal data
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
      ...crumb,
      message: undefined,
      data: undefined,
    }))
  }

  return event
}

if (SENTRY_ENABLED) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: NODE_ENV || 'production',
    sendDefaultPii: false,
    maxBreadcrumbs: 20,
    beforeSend: scrubEvent,
  })
}
