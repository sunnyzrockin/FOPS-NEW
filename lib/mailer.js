/**
 * Email helpers using Resend.
 * Set RESEND_API_KEY (and optionally RESEND_FROM, INVITE_BASE_URL) in env.
 *
 * Falls back gracefully if RESEND_API_KEY is not set:
 *   - logs the email contents to console
 *   - returns { ok: true, mocked: true } so the rest of the flow still works
 *   - the API endpoint still returns the invite token so it can be copied/pasted
 */

import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_ADDRESS = process.env.RESEND_FROM || 'FOPS <onboarding@resend.dev>';
const APP_BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.INVITE_BASE_URL ||
  'https://fopsapp.com';

let _client = null;
function client() {
  if (!RESEND_API_KEY) return null;
  if (!_client) _client = new Resend(RESEND_API_KEY);
  return _client;
}

/**
 * Send an invite email. The invite link is /accept-invite?token=<token>
 *
 *   await sendInviteEmail({
 *     to: 'newstaff@example.com',
 *     inviterName: 'Sarah Johnson',
 *     role: 'staff',
 *     token: 'abc-123',
 *     siteName: 'Brisbane Central',
 *   });
 */
export async function sendInviteEmail({ to, inviterName, role, token, siteName }) {
  const acceptUrl = `${APP_BASE_URL}/accept-invite?token=${encodeURIComponent(token)}`;
  const roleLabel = role === 'staff' ? 'Staff' : role === 'operator' ? 'Operator' : 'Owner';

  const subject = `${inviterName || 'FOPS'} invited you to join FOPS as ${roleLabel}`;

  const html = `
  <!doctype html>
  <html>
    <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
      <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <div style="padding:20px 28px;background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;">
          <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">FOPS — Field Operations System</div>
          <div style="font-size:22px;font-weight:600;margin-top:4px;">You've been invited</div>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 12px 0;font-size:15px;line-height:1.5;">
            Hi there,
          </p>
          <p style="margin:0 0 18px 0;font-size:15px;line-height:1.5;">
            <strong>${inviterName || 'A FOPS user'}</strong> invited you to join FOPS as a <strong>${roleLabel}</strong>${
              siteName ? ` for <strong>${siteName}</strong>` : ''
            }.
          </p>
          <p style="margin:0 0 18px 0;font-size:15px;line-height:1.5;">
            Click the button below to set your password and activate your account.
          </p>
          <p style="margin:24px 0;text-align:center;">
            <a href="${acceptUrl}"
               style="display:inline-block;padding:13px 26px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">
              Accept Invitation &amp; Set Password
            </a>
          </p>
          <p style="margin:18px 0 0 0;font-size:13px;color:#64748b;line-height:1.5;">
            This link will expire in 7 days. If the button doesn't work, copy &amp; paste this URL:
            <br>
            <a href="${acceptUrl}" style="color:#2563eb;word-break:break-all;">${acceptUrl}</a>
          </p>
        </div>
        <div style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
          If you weren't expecting this invitation you can safely ignore this email.
        </div>
      </div>
    </body>
  </html>`;

  const text = `${inviterName || 'A FOPS user'} invited you to join FOPS as ${roleLabel}.

Accept the invitation:
${acceptUrl}

This link expires in 7 days. If you weren't expecting this email, you can ignore it.`;

  const c = client();
  if (!c) {
    // Dev/no-key fallback: log + return success
    console.warn(
      `[mailer] RESEND_API_KEY not set — would have sent invite email to ${to}\nLink: ${acceptUrl}`
    );
    return { ok: true, mocked: true, acceptUrl };
  }

  try {
    const result = await c.emails.send({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
      text,
    });
    if (result.error) {
      console.error('[mailer] Resend error:', result.error);
      return { ok: false, error: result.error.message, acceptUrl };
    }
    return { ok: true, id: result.data?.id, acceptUrl };
  } catch (e) {
    console.error('[mailer] Send threw:', e);
    return { ok: false, error: e.message, acceptUrl };
  }
}
