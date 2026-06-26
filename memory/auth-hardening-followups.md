# Auth hardening — follow-ups & decisions

> Companion to `memory/EMERGENT_auth_hardening.md`.
> Captures (a) decisions made during the Part B implementation, and (b)
> the deferred work (B5 — MFA enforcement for owners) and how it should
> land.

---

## B2 — Rate limit strategy decision

**Decision: (a) primary = Supabase platform rate limits; in-memory limiter = best-effort defence in depth.**

Reasoning:

1. **Vercel serverless reality.** Each cold-start instance gets its own
   `Map`, so an attacker fanning across instances bypasses the
   in-memory limiter. A meaningful per-IP/email count needs a shared
   store.
2. **Supabase already enforces a durable per-IP/email rate limit at the
   edge.** Part A3 of the hardening doc tuned these from the dashboard
   (`Auth → Rate Limits`). They survive instance churn and apply to ALL
   sign-in, sign-up, OTP, and recovery flows uniformly — including the
   client-side `supabase.auth.signInWithPassword()` calls that don't go
   through our login API at all.
3. **Cost of going to Upstash Redis / Vercel KV right now**: a new
   dependency, environment variables, a region-pinning consideration,
   and a 5–15 ms latency adder on every login. Not worth it pre-launch
   when the Supabase edge already covers the primary attack.
4. **Defence in depth is still useful.** The in-memory limiter:
   - Catches obvious fast loops *within a single instance* (the common
     case for a curl/scripted attack from a single IP).
   - Blocks before we even call Supabase, saving the platform quota.
   - Returns a clear 429 with `Retry-After`, which Supabase's response
     also includes but ours arrives sooner.

When we DO want a real shared limiter:

- Plug Upstash Redis / Vercel KV behind the same `rateLimit()`
  function signature in `lib/auth-helpers.js`. Callers don't need to
  change.
- Suggested env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Key shape unchanged: `signup:${ip}`, `login:${ip}:${emailLower}`.

### Endpoints wired up in B2

| Route | Key shape | Limit | Window |
|---|---|---:|---:|
| `POST /api/auth/login`  | `login:${ip}:${emailLower}` | 8 | 60s |
| `POST /api/auth/signup` | `signup:${ip}`              | 5 | 60s |

`POST /api/auth/demo-login` is **not** rate-limited from our code: it
maps to a fixed seeded demo account; Supabase's platform limit covers
abuse, and demo login is by design easy to use.

No password-reset route exists in our codebase — Supabase's
`auth.resetPasswordForEmail()` is called client-side directly to
Supabase, so Supabase's platform recovery limit (Part A3) is the only
applicable defence.

---

## B5 — MFA for owners (deferred)

Marked 🟡 in the hardening doc as the biggest piece. Plan below so it
can be shipped right after smaller items without re-discovery.

### Prereqs (already done in Part A)

- ☑️ Supabase Auth → MFA → TOTP enabled at the project level.

### Implementation outline

1. **Enrollment surface** — new page `app/account/security/page.js`
   showing the user's enrolled factors and a "Add authenticator app"
   button. Wraps `supabase.auth.mfa.enroll({ factorType: 'totp' })`,
   shows the QR + secret, then verifies the first code with
   `supabase.auth.mfa.challenge` + `verify`.
2. **First-login nudge for owners** — extend
   `lib/billing-gate.js`-style middleware so an owner whose JWT does
   not have `aal === 'aal2'` and has no enrolled factor is redirected
   to the enrollment page after login. Cookie/local-storage allow them
   to defer once during the grace period; after `MFA_ENROLLMENT_GRACE_DAYS`
   it's hard-gated.
3. **Step-up on login** — after `signInWithPassword` resolves, check
   `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`. If owner
   AND `currentLevel !== nextLevel`, show the TOTP challenge UI;
   call `auth.mfa.challenge` + `verify`. Block the redirect to `/app`
   until AAL2 is reached.
4. **Server-side enforcement** — extend `verifyAuth()` in
   `lib/auth-helpers.js`:
   ```js
   if (userRow.role === 'owner') {
     const aal = authUser?.aal || authUser?.amr?.find?.(/* … */);
     if (aal !== 'aal2') {
       return { ok: false, response: NextResponse.json(
         { error: 'MFA step-up required', code: 'mfa_required' },
         { status: 401 }) };
     }
   }
   ```
   Gated by an `MFA_OWNERS_REQUIRED` env flag so we can roll out
   tenant-by-tenant if needed.
5. **Recovery path** — support-tier endpoint to reset an owner's
   factors if their device is lost. Add to
   `app/api/founder/users/[id]/reset-mfa/route.js`.
6. **Audit** — log `auth.mfa.enroll`, `auth.mfa.challenge.success`,
   `auth.mfa.challenge.failure`, `auth.mfa.reset_by_support` via
   `logAudit()`.

### Estimate

~1–2 days of focused work. Mostly UI for the enrollment+challenge
screens, plus the middleware extension. The Supabase JS SDK already
provides every primitive — no DB schema changes.

### Suggested env vars

```
MFA_OWNERS_REQUIRED=true        # global switch
MFA_ENROLLMENT_GRACE_DAYS=14    # how long owners can defer enrollment
```

---

## Verification checklist (after deploy to prod, owner runs)

- ☐ Signup with 8-char password → 400 with the specific policy errors.
- ☐ Signup with `Abcdef123456` (12 chars, 3 classes) → succeeds.
- ☐ Signup with `aaaaaaaaaaaa` (12× single class) → 400 ("must include
  at least 3 of …").
- ☐ Rapid repeated logins from one IP+email → 429 with `Retry-After`
  header (or Supabase's own limit fires first — either is a pass).
- ☐ `GET /api/admin/cleanup-orphan-auth-users` as an owner JWT → 403
  with `"Support role required"`.
- ☐ `GET /api/admin/cleanup-orphan-auth-users` as a support JWT → 200
  with the dry-run report.
- ☐ Re-run Supabase Security Advisor → "Leaked Password Protection"
  warning gone (Part A1); the new-helper public-execute warnings will
  go after the SEC1 prod execution (Part C, already wired into the
  SEC1 helpers SQL R2 with REVOKE FROM PUBLIC).

---

## Part C — SECURITY DEFINER warnings (status)

Already wired into the SEC1 deliverables (R2, 2026-06-22):

- `lib/supabase-sec1-helpers.sql` Section 3: `REVOKE EXECUTE ... FROM PUBLIC, anon` before `GRANT TO authenticated` on all 4 new helpers.
- `lib/supabase-sec1-helpers.sql` Section 5: `ALTER FUNCTION ... SET search_path = public` on the 3 trigger functions.
- Legacy helper drops moved to migration Phase A.3 with `RESTRICT` (after legacy policies are dropped). Staging rehearsal 2026-06-25 confirmed this catches the `auth_user_uuid()` policy-dependency case loudly.

Nothing to do for Part C in this hardening commit.
