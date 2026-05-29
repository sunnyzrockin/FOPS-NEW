/**
 * Shared whitelist-safe arithmetic evaluator for shift report numeric
 * inputs.
 *
 * History: Extracted from /app/components/staff/shift-report-form.jsx
 * and /app/components/staff/shift-report-wizard.jsx (Section 5b of the
 * May 2026 redesign). Both components had identical copies — this is the
 * single source of truth.
 *
 * Design constraints:
 *   1. Staff can type either plain numbers ("123.45") or simple math
 *      expressions ("12 + 34 - 5"). The latter is convenient for tallying
 *      cash drawers, fuel deliveries, etc.
 *   2. We MUST NOT eval arbitrary JavaScript. The whitelist regex only
 *      allows digits, decimals, parentheses, the four basic operators,
 *      and whitespace. Anything else (identifiers, function calls,
 *      template literals, etc.) is rejected.
 */

/**
 * Evaluate a numeric input or arithmetic expression.
 *
 * Examples:
 *   evalFormula('123')        →  123
 *   evalFormula('1,234.56')   →  1234.56  (thousands-separator commas tolerated)
 *   evalFormula('+50')        →  50
 *   evalFormula('12 + 34')    →  46
 *   evalFormula('(2+3)*4')    →  20
 *   evalFormula('alert(1)')   →  null   (rejected — unsafe identifier)
 *   evalFormula('1+')         →  null   (trailing operator)
 *   evalFormula('')           →  null
 *
 * @param {string|number|null|undefined} input
 * @returns {number|null}  The numeric value rounded to 2 dp, or `null` if
 *   the input is empty, plain text, or evaluates to NaN/Infinity.
 */
export function evalFormula(input) {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const stripped = raw.replace(/^\+/, '');
  // Remove thousands-separator commas (only between digits).
  const noCommas = stripped.replace(/(\d),(?=\d{3}(\D|$))/g, '$1');
  // Whitelist check — refuses anything outside the math vocabulary.
  if (!/^[0-9+\-*/().\s]+$/.test(noCommas)) return null;
  // Reject sequences that would be obviously invalid (lone operator etc.)
  if (/[+\-*/]\s*$/.test(noCommas) || /^\s*[*/]/.test(noCommas)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${noCommas});`);
    const v = fn();
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    // Round to 2 decimal places to avoid float artefacts (1.1 + 2.2 etc.)
    return Math.round(v * 100) / 100;
  } catch {
    return null;
  }
}

/**
 * Heuristic: returns true if the string looks like the user is mid-formula
 * (contains an operator beyond the leading "+"). Used to decide whether to
 * show a live preview of the evaluated value below the input.
 *
 * @param {string|null|undefined} s
 * @returns {boolean}
 */
export function looksLikeFormula(s) {
  if (!s) return false;
  const stripped = String(s).trim().replace(/^\+/, '');
  return /[+\-*/(]/.test(stripped);
}
