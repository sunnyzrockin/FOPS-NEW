'use client';

/**
 * Next.js 15 App Router global error boundary.
 *
 * Catches React rendering errors that bubble up past every nested
 * error.js boundary, sends them to Sentry, and renders a minimal
 * fallback shell so the user isn't staring at a white screen.
 *
 * Per Next.js docs, this file MUST include its own <html> and <body>
 * because the root layout has already errored out by the time it renders.
 */

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'global-error' } });
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#FAFAF6', color: '#0E1B2A' }}>
        <div style={{ maxWidth: 520, margin: '15vh auto', padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Something went wrong.</h1>
          <p style={{ fontSize: 14, color: '#0E1B2A99', marginBottom: 24 }}>
            We&apos;ve been notified and are looking into it. You can retry below.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: '#0d9488', color: 'white',
              border: 'none', borderRadius: 6,
              padding: '8px 18px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
