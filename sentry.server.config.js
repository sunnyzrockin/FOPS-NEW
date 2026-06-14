// Sentry — Node.js server runtime initialization.
// Loaded via instrumentation.js (Next.js 15 App Router register hook).

import * as Sentry from '@sentry/nextjs';
import { scrubSensitiveData } from './lib/sentry-scrub';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',

  tracesSampleRate: 1.0,

  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 0.0,
  profilesSampleRate: 0.0,

  sendDefaultPii: false,

  beforeSend(event) {
    return scrubSensitiveData(event);
  },
});
