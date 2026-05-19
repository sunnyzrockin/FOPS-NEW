import { NextResponse } from 'next/server';

/**
 * Standard CORS headers shared by every API route in FOPS.
 * If you need to add a header, do it HERE so legacy and new routes
 * stay in lock-step.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/** Attach corsHeaders to an existing Response (in-place). */
export function attachCors(response) {
  for (const [k, v] of Object.entries(corsHeaders)) {
    response.headers.set(k, v);
  }
  return response;
}

/** Standard OPTIONS preflight handler — `export const OPTIONS = optionsHandler;` */
export function optionsHandler() {
  return NextResponse.json({}, { headers: corsHeaders });
}

/** Helper for handlers — wraps a NextResponse.json call with CORS headers. */
export function jsonWithCors(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...corsHeaders, ...(init.headers || {}) },
  });
}
