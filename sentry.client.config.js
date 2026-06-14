// Sentry — browser runtime initialization.
// Loaded automatically by @sentry/nextjs on the client.

import * as Sentry from '@sentry/nextjs';
import { scrubSensitiveData } from './lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',

  // Performance: 100% while we're small. Drop this to 0.1–0.2 once traffic
  // scales beyond ~50k page views/day.
  tracesSampleRate: 1.0,

  // Replays + profiling — explicitly disabled per integration scope.
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 0.0,
  profilesSampleRate: 0.0,

  // Never auto-attach IP, cookies, or other PII.
  sendDefaultPii: false,

  beforeSend(event) {
    return scrubSensitiveData(event);
  },
});
