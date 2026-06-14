// Sentry — Edge runtime initialization.
// Loaded via instrumentation.js when NEXT_RUNTIME=edge (middleware / edge
// route handlers). We don't currently use edge runtimes but the config
// is here so future middleware additions are observed automatically.

import * as Sentry from '@sentry/nextjs';
import { scrubSensitiveData } from './lib/sentry-scrub';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',

  tracesSampleRate: 1.0,

  sendDefaultPii: false,

  beforeSend(event) {
    return scrubSensitiveData(event);
  },
});
