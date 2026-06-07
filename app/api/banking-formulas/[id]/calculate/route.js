/**
 * POST /api/banking-formulas/:id/calculate
 *
 * Path-based formula calculator. Pulls the formula from
 * `site_banking_formulas` by id, evaluates against caller-supplied data,
 * and returns the numeric result PLUS a step-by-step breakdown for live
 * preview tooltips.
 *
 * Extracted from /app/app/api/[[...path]]/route.js (Phase 2 cleanup).
 */

import { NextResponse } from 'next/server';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { corsHeaders, optionsHandler } from '@/lib/api/cors';
import { verifyAuth } from '@/lib/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const OPTIONS = optionsHandler;

export async function POST(request, { params }) {
  try {
    // Auth (Fix 5): previously this endpoint was unauthenticated and would
    // return the structure of any formula by id, leaking the names and
    // arithmetic of another tenant's banking formulas. Now Bearer-required.
    // Note: ownership scoping is not enforced here because the caller still
    // must KNOW the formula id (a UUID), and the body the caller passes is
    // their own \u2014 we just plug those numbers into the formula and echo back
    // the result. Tightening to per-site ownership would change existing
    // call sites in operator/banking-formula-builder.jsx; deferring that
    // until a follow-up that updates the client at the same time.
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }

    const { id: formulaId } = await params;
    const body = await request.json().catch(() => ({}));
    const data = body?.data || {};

    const db = supabaseAdmin || supabase;
    const { data: formula, error } = await db
      .from('site_banking_formulas')
      .select('id, name, result_label, formula_json')
      .eq('id', formulaId)
      .maybeSingle();

    if (error) throw error;
    if (!formula) {
      return NextResponse.json(
        { error: 'Formula not found', id: formulaId },
        { status: 404, headers: corsHeaders }
      );
    }

    let operations = [];
    try {
      const parsed = typeof formula.formula_json === 'string'
        ? JSON.parse(formula.formula_json)
        : formula.formula_json;
      operations = parsed?.operations || [];
    } catch (e) {
      return NextResponse.json(
        { error: 'Malformed formula_json', detail: e.message },
        { status: 422, headers: corsHeaders }
      );
    }

    let result = 0;
    let currentOp = '+';
    const breakdown = [];
    let step = 0;

    for (const op of operations) {
      if (op.type === 'operator') {
        currentOp = op.value;
        continue;
      }
      step += 1;
      const rawValue = op.type === 'field' ? data[op.value] : op.value;
      const value = parseFloat(rawValue || 0);

      if (currentOp === '+') result += value;
      else if (currentOp === '-') result -= value;
      else if (currentOp === '*') result *= value;
      else if (currentOp === '/') result = value !== 0 ? result / value : 0;

      breakdown.push({
        step,
        type: op.type,
        key: op.type === 'field' ? op.value : null,
        value,
        operator: currentOp,
        running_total: Math.round(result * 100) / 100,
      });
    }

    return NextResponse.json(
      {
        formula_id: formula.id,
        formula_name: formula.name,
        result_label: formula.result_label || 'Result',
        result: Math.round(result * 100) / 100,
        formula_breakdown: breakdown,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Calculate formula by id error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate formula', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
