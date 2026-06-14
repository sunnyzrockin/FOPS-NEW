/**
 * GET /api/sentry-test
 *
 * Smoke-test endpoint for the Sentry integration. Hitting this URL
 * throws a controlled exception that should appear in your Sentry
 * dashboard within ~30 seconds.
 *
 * Safe to leave in prod — it just throws an error; no data is mutated.
 * If you want to lock it down later, gate it behind a header check.
 */

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    throw new Error('FOPS Sentry smoke-test — if you can read this in Sentry, observability is wired correctly.');
  } catch (err) {
    Sentry.captureException(err, {
      tags: { module: 'sentry-test', environment: process.env.SENTRY_ENVIRONMENT },
    });
    return NextResponse.json(
      { ok: false, error: 'Sentry test error fired', sent: true },
      { status: 500 },
    );
  }
}
