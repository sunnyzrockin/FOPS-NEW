/**
 * Catch-all API fallback.
 *
 * History: Originally a 3037-line monolith that served the entire FOPS
 * backend. Over Phases 1 & 2 every endpoint was extracted into a dedicated
 * modular route under /app/app/api/{module}/route.js, and Next.js's
 * file-based router prefers those specific paths over this catch-all.
 *
 * This file now serves a single purpose: return a clean JSON 404 (with
 * CORS) for any path the modular routes did not match. Keeping the
 * `[[...path]]` segment ensures we don't accidentally fall through to the
 * Next.js HTML 404 page for API consumers.
 */
import { NextResponse } from 'next/server';
import { corsHeaders, optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const OPTIONS = optionsHandler;

function notFound(request) {
  const url = new URL(request.url);
  return NextResponse.json(
    { error: 'Not found', path: url.pathname, method: request.method },
    { status: 404, headers: corsHeaders }
  );
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const DELETE = notFound;
export const PATCH = notFound;
