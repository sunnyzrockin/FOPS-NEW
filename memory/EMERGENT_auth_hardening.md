# FOPS — Auth Hardening (pre-launch)

Two parts: **(A) Supabase dashboard toggles** you do directly, and **(B) Emergent code changes**. Several map straight to the Security Advisor warnings. None of this is a live exploit today — it's raising the floor before real testers.

---

## A. Supabase dashboard — OWNER toggles (no code, do these now)

1. **Enable Leaked Password Protection** (Auth → Providers/Policies → Password security). This is the Advisor's "Leaked Password Protection Disabled" warning. Rejects passwords found in known breaches (HaveIBeenPwned). One toggle.
2. **Raise minimum password length to 12** and require character variety (Auth → password settings). Default is weak.
3. **Review built-in Auth rate limits** (Auth → Rate Limits): sign-in, sign-up, OTP, recovery. Supabase enforces these at the platform edge — more reliable than app-level limiting on serverless. Tighten if defaults are loose.
4. **Turn on MFA capability** (Auth → MFA → enable TOTP) so the app can enroll it (enforcement is the code task in B5).

> These platform-level controls are your real protection on serverless. App-level checks (B) are defence-in-depth on top.

---

## B. Emergent — code changes

### B1. Server-side password policy 🔴
`app/api/auth/signup/route.js` currently validates only that password is non-empty — the "8 characters" is a **client hint only**. Enforce server-side: reject < 12 chars (and ideally require mixed character classes) with a clear 400 before `createUser`. Mirror the rule in the signup page's inline validation. Keep the new error visible (the `detail`-surfacing from the signup fix already handles this).

### B2. Wire up rate limiting + fix the serverless gap 🔴
A rate limiter already exists in `lib/auth-helpers.js` (the in-memory one returning 429), but:
- Confirm it's actually **applied** to `app/api/auth/login`, `/signup`, and any password-reset route — the login route doesn't appear to call it.
- **In-memory won't work on Vercel** — each serverless instance has its own memory, so limits don't hold across instances/cold starts. Either (a) rely primarily on **Supabase's built-in auth rate limits** (A3) and treat the in-memory one as best-effort, or (b) back it with a shared store (Upstash Redis / Vercel KV) for a real per-IP/email limit. State which you chose.

### B3. Tighten the admin cleanup endpoint 🟠
`app/api/admin/cleanup-orphan-auth-users` is gated to `role === 'owner'` — i.e. **any tenant owner** can trigger a platform-wide orphan-auth cleanup. Change to **support/founder-only** (`role === 'support'`), matching the founder endpoints.

### B4. Confirm `fuel-prices-live/sync` is guarded 🟠
This endpoint showed no auth in the audit. Confirm it's auth-gated (operator/owner) or at least rate-limited — an open sync trigger is a cost/DoS vector even on public data.

### B5. MFA for owners 🟡 (larger — can be a fast-follow)
With TOTP enabled (A4): enroll MFA for owner accounts (at first login or in settings) and require the second factor at login for `role === 'owner'`. Owners hold the most access, so they're the priority. Operators/staff can follow later. This is the biggest piece — fine to ship right after the smaller items if it slows the others.

---

## C. SECURITY DEFINER function warnings (fold into the SEC1 rollout — don't do ad-hoc)

The Advisor's "Public Can Execute SECURITY DEFINER Function" warnings split in two:
- **Legacy, unused helpers** (`get_operator_site_ids`, `get_staff_site_ids`, `get_user_id_from_auth`, `auth_user_role/site_ids/uuid`) — leftovers from old RLS attempts. The SEC1 helpers file already DROPs these. **Caution:** check whether the existing `users` RLS policy references `get_user_id_from_auth()` before dropping (CASCADE would take the policy with it). Handle inside the gated SEC1 run, not now.
- **The new helpers** (`user_site_ids`, `user_role`) — add `REVOKE EXECUTE ... FROM PUBLIC, anon;` so only `authenticated` can call them (the hotfix granted to authenticated but the default PUBLIC grant remains → that's the warning). Add the REVOKE to `lib/supabase-sec1-helpers.sql`.
- **Function Search Path Mutable** (3 trigger fns: `set_fuel_deliveries_updated_at`, `tanks_set_updated_at`, `set_dip_readings_updated_at`) — add `SET search_path = public` to each. Minor; bundle with the SEC1 run.

---

## Priority order
1. **A1–A3** (Supabase toggles) — minutes, real protection, do today.
2. **B1 + B3 + B4** — small, high-value code changes.
3. **B2** — decide the rate-limit strategy (Supabase limits vs. shared store).
4. **A4 + B5** — MFA for owners (fast-follow).
5. **C** — folded into the gated SEC1 rollout (add the REVOKE + search_path to the SEC1 files now so they're ready).

## Verify (prod, after Emergent ships B)
- Signup with an 8-char password → rejected with a clear message; 12+ accepted.
- Rapid repeated logins → 429 (or confirm Supabase's limit fires).
- `admin/cleanup-orphan-auth-users` as an owner JWT → 403; support → 200.
- Re-run Security Advisor → "Leaked Password Protection" warning gone; new-helper public-execute warnings gone after the REVOKE.
