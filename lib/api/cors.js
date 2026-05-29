import { NextResponse } from 'next/server';

/**
 * Origin-aware CORS for the FOPS backend.
 *
 * Production: a single allowed origin from process.env.NEXT_PUBLIC_BASE_URL
 *             (falls back to the canonical https://www.fopsapp.com if the
 *             env var is somehow missing).
 *
 * Development: also allows http://localhost:3000 so `yarn dev` works.
 *
 * NOTE: When `Access-Control-Allow-Credentials` is involved, browsers
 *       reject `*` — explicit single-origin echo is the only safe choice
 *       for an authenticated API. We always echo the *configured* origin,
 *       not the request's Origin header, so we can't be tricked by a
 *       caller masquerading as a trusted origin.
 */

const PROD_ORIGIN =
  process.env.NEXT_PUBLIC_BASE_URL || 'https://www.fopsapp.com';
const DEV_ORIGIN = 'http://localhost:3000';
const ALLOW_DEV = process.env.NODE_ENV !== 'production';

/**
 * Resolve the right allowed origin for a given request. If the caller's
 * `Origin` header matches one of the allow-listed origins, echo that back;
 * otherwise fall back to the production origin (browsers will then reject
 * cross-origin requests, which is what we want).
 */
function resolveAllowedOrigin(requestOrigin) {
  if (ALLOW_DEV && requestOrigin === DEV_ORIGIN) return DEV_ORIGIN;
  return PROD_ORIGIN;
}

/** Build a fresh CORS headers object for a request. */
export function corsHeadersFor(request) {
  const requestOrigin = request?.headers?.get?.('origin') || null;
  return {
    'Access-Control-Allow-Origin': resolveAllowedOrigin(requestOrigin),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}

/**
 * Static fallback used by code paths that don't have access to the
 * incoming `request` object. Always returns the configured PROD origin
 * (or the dev origin if NODE_ENV !== 'production' AND the dev origin is
 * what NEXT_PUBLIC_BASE_URL was set to). Most callers should prefer
 * `corsHeadersFor(request)`.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': PROD_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Credentials': 'true',
  Vary: 'Origin',
};

/** Attach corsHeaders to an existing Response (in-place). */
export function attachCors(response, request = null) {
  const headers = request ? corsHeadersFor(request) : corsHeaders;
  for (const [k, v] of Object.entries(headers)) {
    response.headers.set(k, v);
  }
  return response;
}

/** Standard OPTIONS preflight handler — `export const OPTIONS = optionsHandler;` */
export function optionsHandler(request) {
  return NextResponse.json(
    {},
    { headers: request ? corsHeadersFor(request) : corsHeaders }
  );
}

/** Helper for handlers — wraps a NextResponse.json call with CORS headers. */
export function jsonWithCors(body, init = {}, request = null) {
  const headers = request ? corsHeadersFor(request) : corsHeaders;
  return NextResponse.json(body, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
}
