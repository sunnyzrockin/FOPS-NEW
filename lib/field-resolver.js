/**
 * lib/field-resolver.js — config-key ↔ stored-column reconciliation.
 *
 * Sites configure their shift-report fields via `site_field_configs`. The
 * `key` operators choose (e.g. `cash_drop`, `account`, `drive_off_iou`)
 * doesn't always match the legacy flat columns on the `shift_reports`
 * table (`cash`, `accounts`, `drive_offs`). Values entered via the new
 * wizard land in `custom_values` under the config key; values from old
 * reports (or fields whose key happens to match a flat column) live in
 * the flat column.
 *
 * `resolveFieldValue` checks ALL viable storage locations for a given
 * config key — both the key itself and any well-known aliases — first on
 * the flat row, then in `custom_values`. Returns 0 only if nothing is
 * found. This is the SINGLE source of truth for rendering a raw field
 * value, so dashboards, the operator review panel, and the full report
 * detail view all stay in agreement.
 *
 * No runtime dependencies — pure JS, safe to import server- or client-side.
 */

/**
 * Bidirectional alias map: every entry lists every storage name that has
 * EVER meant the same financial field. Add to this map (don't remove)
 * when a new operator-configurable key surfaces that clashes with a
 * legacy column. Keep entries symmetric so a lookup by either side
 * finds the other.
 */
export const FIELD_KEY_ALIASES = {
  // Cash variants
  cash:           ['cash_drop'],
  cash_drop:      ['cash'],

  // Account(s) variants
  account:        ['accounts'],
  accounts:       ['account'],

  // Drive-off variants (incl. legacy IOU bundling)
  drive_offs:     ['drive_off_iou', 'drive_off', 'drive_offs_iou'],
  drive_off_iou:  ['drive_offs', 'drive_off', 'drive_offs_iou'],
  drive_off:      ['drive_offs', 'drive_off_iou'],

  // Fuel cards — Motorpass is the AU brand name; sites that label their
  // field "Fuel Cards" still write to the legacy `motorpass` column.
  motorpass:      ['fuel_cards', 'fuel_card'],
  fuel_cards:     ['motorpass'],
  fuel_card:      ['motorpass'],
};

const isPresent = (v) => v !== undefined && v !== null && v !== '';

/**
 * Resolve a single config field's display value against a report row.
 *
 * @param {Object} report        — single shift_reports row (with custom_values).
 * @param {string} key           — the config field's `key` from site_field_configs.
 * @returns {number|string}      — the resolved value, or 0 when no match exists.
 */
export function resolveFieldValue(report, key) {
  if (!report || !key) return 0;
  const aliases = FIELD_KEY_ALIASES[key] || [];
  const candidates = [key, ...aliases];

  // Pass 1: flat columns on the report row (canonical or legacy).
  for (const k of candidates) {
    if (isPresent(report[k])) return report[k];
  }

  // Pass 2: operator-defined custom_values JSONB.
  const cv = (report.custom_values && typeof report.custom_values === 'object')
    ? report.custom_values : {};
  for (const k of candidates) {
    if (isPresent(cv[k])) return cv[k];
  }

  return 0;
}

/**
 * Convenience: filter + sort a `site_field_configs` array down to the
 * sales fields that should appear in the "Raw Field Values" / banking
 * grid. Centralised here so every consumer applies the SAME predicate.
 */
export function bankingSalesFields(configs) {
  if (!Array.isArray(configs)) return [];
  return configs
    .filter((c) => c?.category === 'sales' && c?.show_in_banking === true)
    .sort((a, b) => (a?.display_order ?? 0) - (b?.display_order ?? 0));
}
