/**
 * /api/reports/pivot — Operator pivot table feed.
 *
 * Returns the data shaped exactly the way the Monthly Reports view wants
 * it: a list of columns (dynamic, based on the site's enabled sales
 * fields) plus one row per day in the requested range with each cell
 * already summed across all shifts in that day.
 *
 * Sources:
 *   - `site_field_configs` (category='sales', enabled, sorted by display_order)
 *     → column metadata
 *   - `shift_reports` (real columns + custom_values JSONB)
 *     → row values; for keys that are real columns we pull them straight,
 *       for keys that aren't we pull from custom_values[key]
 *
 * Output:
 * {
 *   site: { id, name },
 *   from, to, days,
 *   columns: [{ key, label, source: 'column'|'custom', is_mandatory }],
 *   rows:    [{ date, shifts, values: { [key]: number|null }, total_known }],
 *   totals:  { [key]: number },
 *   shift_breakdowns: { [date]: [ { shift_type, values: {...} } ] }
 * }
 *
 * Permissions: owner | operator (operators are scoped to their assigned
 * sites by getAllowedSiteIds).
 */
import { supabaseAdmin } from '@/lib/supabase';
import supabase from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';
import { jsonWithCors, attachCors } from '@/lib/api/cors';
import { getAllowedSiteIds } from '@/lib/api/site-access';

// Hard-coded list of real `shift_reports` columns so we know which keys
// can be read directly vs which keys need to be pulled from custom_values.
const REAL_REPORT_COLUMNS = new Set([
  'total_sales', 'fuel_sales', 'shop_sales', 'total_litres',
  'eftpos', 'motorpass', 'cash', 'accounts',
  'beverages', 'hot_food',
  'drive_offs', 'dips', 'total_revenue', 'difference_value',
]);

function _toNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function _enumerateDays(from, to) {
  const out = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function handlePivot(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return attachCors(auth.response);
    const currentUser = auth.user;
    if (!['owner', 'operator'].includes(currentUser.role)) {
      return jsonWithCors({ error: 'Operator or owner role required' }, { status: 403 });
    }

    const url = new URL(request.url);
    const siteId = url.searchParams.get('site_id');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const includeShiftBreakdown = url.searchParams.get('breakdown') === '1';

    if (!siteId)  return jsonWithCors({ error: 'site_id is required' }, { status: 400 });
    if (!from || !to) return jsonWithCors({ error: 'from and to YYYY-MM-DD are required' }, { status: 400 });

    const allowed = await getAllowedSiteIds(currentUser);
    if (!allowed.includes(siteId)) {
      return jsonWithCors({ error: 'You are not assigned to this site.' }, { status: 403 });
    }

    const admin = supabaseAdmin || supabase;

    // 1. Pull dynamic columns from site_field_configs.
    const { data: fcRows, error: fcErr } = await admin
      .from('site_field_configs')
      .select('key, label, field_type, display_order, is_mandatory, is_enabled, category, show_in_banking')
      .eq('site_id', siteId)
      .order('display_order', { ascending: true });
    if (fcErr) throw fcErr;

    const columns = (fcRows || [])
      // Pivot is "Sales & Payments" data. Default null category to 'sales'
      // so legacy rows pre-Phase 3 keep appearing.
      .filter((f) => (f.category || 'sales') === 'sales' && f.is_enabled !== false)
      // Number-flavoured fields only — text fields (notes / codes) can't be
      // summed in a pivot.
      .filter((f) => (f.field_type || 'number') === 'number')
      .map((f) => ({
        key: f.key,
        label: f.label,
        is_mandatory: !!f.is_mandatory,
        source: REAL_REPORT_COLUMNS.has(f.key) ? 'column' : 'custom',
      }));

    // 2. Pull reports for the range.
    const { data: reports, error: rErr } = await admin
      .from('shift_reports')
      .select('*')
      .eq('site_id', siteId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .order('shift_type', { ascending: true });
    if (rErr) throw rErr;

    // 3. Build site label for the response.
    const { data: site } = await admin
      .from('sites')
      .select('id, name')
      .eq('id', siteId)
      .maybeSingle();

    // 4. Aggregate per day.
    const days = _enumerateDays(from, to);
    const totals = {};
    for (const c of columns) totals[c.key] = 0;

    const byDate = new Map();
    const breakdownByDate = new Map();
    for (const r of reports || []) {
      if (!byDate.has(r.date)) byDate.set(r.date, { shifts: 0, values: {} });
      const slot = byDate.get(r.date);
      slot.shifts += 1;

      const perShiftSnapshot = { shift_type: r.shift_type, status: r.status, values: {} };
      for (const c of columns) {
        const raw = c.source === 'column'
          ? r[c.key]
          : (r.custom_values || {})[c.key];
        const num = _toNumber(raw);
        perShiftSnapshot.values[c.key] = num;
        if (num != null) {
          slot.values[c.key] = (slot.values[c.key] || 0) + num;
          totals[c.key] = (totals[c.key] || 0) + num;
        }
      }
      if (includeShiftBreakdown) {
        if (!breakdownByDate.has(r.date)) breakdownByDate.set(r.date, []);
        breakdownByDate.get(r.date).push(perShiftSnapshot);
      }
    }

    const rows = days.map((d) => {
      const slot = byDate.get(d);
      return {
        date: d,
        shifts: slot?.shifts || 0,
        values: slot?.values || {},
        has_data: !!slot && slot.shifts > 0,
      };
    });

    return jsonWithCors({
      site: site || { id: siteId, name: 'Unknown' },
      from, to,
      days: days.length,
      reportCount: (reports || []).length,
      columns,
      rows,
      totals,
      shift_breakdowns: includeShiftBreakdown
        ? Object.fromEntries(breakdownByDate)
        : undefined,
    });
  } catch (e) {
    console.error('Pivot error:', e);
    return jsonWithCors({ error: 'Pivot failed', message: e?.message }, { status: 500 });
  }
}
