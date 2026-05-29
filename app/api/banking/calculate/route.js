/**
 * POST /api/banking/calculate
 *
 * Lightweight stateless formula evaluator. Accepts a `formula_json` string
 * and a `shift_data` object, runs the same left-to-right operator stack we
 * use for stored formulas, and returns the numeric result.
 *
 * Extracted from /app/app/api/[[...path]]/route.js (Phase 2 cleanup).
 */

import { NextResponse } from 'next/server';
import { corsHeaders, optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const OPTIONS = optionsHandler;

export async function POST(request) {
  try {
    const { formula_json, shift_data } = await request.json();

    const operations = JSON.parse(formula_json).operations || [];
    let result = 0;
    let currentOp = '+';

    for (const op of operations) {
      if (op.type === 'field') {
        const value = parseFloat(shift_data?.[op.value] || 0);
        if (currentOp === '+') result += value;
        else if (currentOp === '-') result -= value;
        else if (currentOp === '*') result *= value;
        else if (currentOp === '/') result = value !== 0 ? result / value : 0;
      } else if (op.type === 'operator') {
        currentOp = op.value;
      } else if (op.type === 'number') {
        const value = parseFloat(op.value || 0);
        if (currentOp === '+') result += value;
        else if (currentOp === '-') result -= value;
        else if (currentOp === '*') result *= value;
        else if (currentOp === '/') result = value !== 0 ? result / value : 0;
      }
    }

    return NextResponse.json(
      { result: Math.round(result * 100) / 100 },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Banking calculate error:', error);
    return NextResponse.json(
      { error: 'Failed to calculate formula' },
      { status: 500, headers: corsHeaders }
    );
  }
}
