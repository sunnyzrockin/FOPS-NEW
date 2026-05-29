/**
 * POST /api/support/contact
 *
 * The Contact tab in the in-app help panel submits to this endpoint. We send
 * an email to the support inbox (SUPPORT_EMAIL env, with a sensible fallback)
 * using the existing Resend integration.
 *
 * Auth: requires a logged-in user. The user's identity is taken from the
 * verified JWT — not from the request body — so callers can't spoof who's
 * asking for help.
 *
 * Rate-limit: 5 messages per user per 10 minutes. Soft cap to deter spam
 * while still letting someone fire off two follow-ups in quick succession.
 *
 * Body:
 *   { subject: string (required, <= 200 chars),
 *     message: string (required, <= 5000 chars),
 *     category?: 'bug' | 'question' | 'feature' | 'access' | 'other' }
 *
 * Returns: { ok: true, id?: string, mocked?: true }
 */

import { NextResponse } from 'next/server';
import { corsHeaders, optionsHandler } from '@/lib/api/cors';
import { verifyAuth, rateLimit } from '@/lib/auth-helpers';
import { sendEmail } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export const OPTIONS = optionsHandler;

const SUPPORT_EMAIL =
  process.env.SUPPORT_EMAIL || 'support@workflowlite.app';

const CATEGORIES = new Set(['bug', 'question', 'feature', 'access', 'other']);

function sanitise(str, max) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, max);
}

// Light HTML escape so user-supplied text doesn't break the email layout.
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function POST(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;

    // Per-user rate-limit (uses user id rather than IP so shared NATs aren't
    // an issue and individual abusers can be slowed without blanket blocking).
    const rl = rateLimit({
      key: `support:contact:${auth.user.id}`,
      limit: 5,
      windowMs: 10 * 60_000,
    });
    if (!rl.ok) return rl.response;

    const body = await request.json().catch(() => ({}));
    const subject = sanitise(body?.subject, 200);
    const message = sanitise(body?.message, 5000);
    const category = CATEGORIES.has(body?.category) ? body.category : 'other';

    if (!subject || !message) {
      return NextResponse.json(
        { error: 'subject and message are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Build the email. Identifying info comes from the auth token, NOT the body.
    const user = auth.user;
    const emailSubject = `[FOPS Support · ${category}] ${subject}`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;max-width:640px;">
        <h2 style="margin:0 0 12px 0;font-size:18px;">In-app support message</h2>
        <table style="font-size:14px;border-collapse:collapse;margin:0 0 16px 0;">
          <tr><td style="padding:4px 12px 4px 0;color:#64748b;">From</td><td>${esc(user.name)} &lt;${esc(user.email)}&gt;</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Role</td><td>${esc(user.role)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b;">Category</td><td>${esc(category)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#64748b;">User ID</td><td><code>${esc(user.id)}</code></td></tr>
        </table>
        <div style="border-left:3px solid #2563eb;padding:8px 14px;background:#f8fafc;">
          <div style="font-size:13px;color:#64748b;margin-bottom:4px;">Subject</div>
          <div style="font-size:15px;font-weight:600;margin-bottom:12px;">${esc(subject)}</div>
          <div style="font-size:13px;color:#64748b;margin-bottom:4px;">Message</div>
          <div style="font-size:14px;white-space:pre-wrap;line-height:1.5;">${esc(message)}</div>
        </div>
        <p style="margin:18px 0 0 0;font-size:12px;color:#94a3b8;">
          Sent via /api/support/contact · FOPS in-app help
        </p>
      </div>`;

    const text = `In-app support message

From: ${user.name} <${user.email}>
Role: ${user.role}
Category: ${category}
User ID: ${user.id}

Subject: ${subject}

Message:
${message}

— Sent via /api/support/contact`;

    const result = await sendEmail({
      to: SUPPORT_EMAIL,
      subject: emailSubject,
      html,
      text,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: 'Failed to send support email', detail: result.error },
        { status: 502, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { ok: true, id: result.id, mocked: !!result.mocked },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('[support/contact POST]', error);
    return NextResponse.json(
      { error: 'Failed to send support message', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
