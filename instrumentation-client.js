// Sentry — browser runtime initialization (Next.js 15 "instrumentation-client"
// file convention). This supersedes the legacy sentry.client.config.js file
// and is the form that works with Turbopack.
//
// Webpack picks up both files; sentry.client.config.js is kept as a
// fallback for older tooling but the canonical source is this file.

import * as Sentry from '@sentry/nextjs';
import { scrubSensitiveData } from './lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',

  // Performance tracing: 100% while we're small. Lower to 0.1–0.2 once
  // traffic scales beyond ~50k page views/day.
  tracesSampleRate: 1.0,

  // Per integration scope: replays + profiling explicitly disabled.
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 0.0,
  profilesSampleRate: 0.0,

  // Never auto-attach IP, cookies, or other PII.
  sendDefaultPii: false,

  beforeSend(event) {
    return scrubSensitiveData(event);
  },
});

// Required so Next.js can forward router-level errors / navigation
// performance spans to Sentry.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
