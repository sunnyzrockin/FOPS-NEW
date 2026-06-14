/**
 * Next.js 15 App Router instrumentation hook.
 *
 * Runs once at server / edge startup. We dynamically import the right
 * Sentry config so the edge runtime doesn't pay for Node-only bundles.
 *
 * NOTE: sentry.client.config.js is wired separately by withSentryConfig
 * in next.config.js — we don't import it here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Required by @sentry/nextjs >=8 so Next can forward request-scoped
// errors to Sentry from React server components.
export async function onRequestError(...args) {
  const Sentry = await import('@sentry/nextjs');
  return Sentry.captureRequestError(...args);
}
