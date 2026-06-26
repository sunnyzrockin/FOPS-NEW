/**
 * Server-side password policy.
 *
 * Mirrors the Supabase Dashboard policy (Part A2: min length 12, character
 * variety) but enforced in our own code BEFORE we hand the password to
 * Supabase. Why both? Two reasons:
 *
 *  1. Defence in depth — a Supabase dashboard toggle could be flipped off
 *     accidentally; the server check fails closed.
 *  2. The Supabase error message for a weak password is generic
 *     (`Password should be at least 12 characters.`) and surfaces inside
 *     a wrapped object, which is awkward to display. We can return a
 *     specific, actionable 400 instead.
 *
 * Policy
 * ------
 *   - At least 12 characters.
 *   - Must include at least THREE of the four character classes:
 *       lowercase letter, uppercase letter, digit, symbol.
 *   - No leading/trailing whitespace (caught accidentally pasted ones).
 *
 * The "3 of 4" rule is a deliberate compromise between strict
 * complexity and passphrase-friendliness. Pure all-lowercase passphrases
 * like "four words and four more" are STILL rejected — adding a capital
 * or digit ("Four words and 4 more") makes them pass. NIST 800-63B's
 * guidance is that strict character-class rules hurt UX more than they
 * help; we keep this rule mainly to block trivial 12× single-char
 * passwords like "aaaaaaaaaaaa". Length is still the dominant entropy
 * source.
 *
 * Usage
 * -----
 *   import { validatePasswordPolicy } from '@/lib/auth-password-policy';
 *   const v = validatePasswordPolicy(password);
 *   if (!v.ok) return NextResponse.json({ error: 'Password too weak', detail: v.message, errors: v.errors }, { status: 400 });
 */

export const PASSWORD_MIN_LENGTH = 12;

/** Returns { ok, message, errors } where errors is an array of strings. */
export function validatePasswordPolicy(password) {
  const errors = [];

  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, message: 'Password is required.', errors: ['Password is required.'] };
  }

  if (password !== password.trim()) {
    errors.push('Password cannot start or end with whitespace.');
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters (got ${password.length}).`);
  }

  // Character class variety — must hit ≥3 of 4 classes.
  const classes = [
    { name: 'lowercase letter', test: /[a-z]/.test(password) },
    { name: 'uppercase letter', test: /[A-Z]/.test(password) },
    { name: 'digit',            test: /[0-9]/.test(password) },
    { name: 'symbol',           test: /[^A-Za-z0-9]/.test(password) },
  ];
  const hits = classes.filter((c) => c.test).length;
  if (hits < 3) {
    const missing = classes.filter((c) => !c.test).map((c) => c.name);
    errors.push(
      `Password must include at least 3 of these: lowercase, uppercase, digit, symbol. ` +
      `Missing: ${missing.join(', ')}.`
    );
  }

  if (errors.length) {
    return { ok: false, message: errors[0], errors };
  }
  return { ok: true, message: 'OK', errors: [] };
}

/**
 * Client-friendly summary for the signup form to show inline as the user types.
 * Returns an array of { rule, ok } items.
 */
export function describePasswordPolicy(password = '') {
  return [
    { rule: `At least ${PASSWORD_MIN_LENGTH} characters`,
      ok: typeof password === 'string' && password.length >= PASSWORD_MIN_LENGTH },
    { rule: 'Contains a lowercase letter',
      ok: /[a-z]/.test(password) },
    { rule: 'Contains an uppercase letter',
      ok: /[A-Z]/.test(password) },
    { rule: 'Contains a digit',
      ok: /[0-9]/.test(password) },
    { rule: 'Contains a symbol',
      ok: /[^A-Za-z0-9]/.test(password) },
  ];
}
