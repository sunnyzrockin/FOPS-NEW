/**
 * Reports module — shift report CRUD with audit instrumentation.
 *
 * Phase 2 final extraction from catch-all route.js.
 *
 * Endpoints:
 *   GET    /api/reports[?siteIds=&startDate=&endDate=&status=]
 *   GET    /api/reports/:id
 *   POST   /api/reports                  — creates report + side-effect creates dip readings
 *   PUT    /api/reports/:id/status       — owner/operator review action
 *   DELETE /api/reports/:id              — owner-only
 *
 * All endpoints fully audit-logged with before/after JSONB states.
 */

import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api/cors';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { verifyAuth, requireRole } from '@/lib/auth-helpers';
import { logAuditAsync } from '@/lib/api/audit';
import { notifyOperatorsOfSite, notify } from '@/lib/api/notify';
import { computeTotals, DEFAULT_TOLERANCE_PCT } from '@/lib/financials';

// CORS headers — duplicated from catch-all so this module is self-contained.
export async function handleGetReportById(reportId, request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) return auth.response;
    const db = supabaseAdmin || supabase;

    // Pull the report with site + submitter joined
    const { data: report, error } = await db
      .from('shift_reports')
      .select(`
        *,
        site:sites(id, name, code),
        submitter:users!submitted_by_user_id(id, name, email),
        reviewer:users!reviewed_by_user_id(id, name, email)
      `)
      .eq('id', reportId)
      .maybeSingle();

    if (error) throw error;
    if (!report) {
      return NextResponse.json(
        { error: 'Report not found', id: reportId },
        { status: 404, headers: corsHeaders }
      );
    }

    // Pull per-formula results so the UI can show an audit breakdown.
    // Table: shift_formula_results { id, shift_report_id, formula_id,
    //                                formula_name, result_value, calculated_at }
    let formula_results = [];
    try {
      const { data: frs } = await db
        .from('shift_formula_results')
        .select('id, formula_id, formula_name, result_value, calculated_at')
        .eq('shift_report_id', reportId)
        .order('calculated_at', { ascending: true });
      formula_results = Array.isArray(frs) ? frs : [];
    } catch (e) {
      console.warn('formula_results fetch failed:', e?.message);
    }

    // Flatten the joined names for client convenience. Also spread
    // custom_values JSONB back onto the top level so consumers that look
    // up by field key (ReportDetail, BankingSubmissions) can read
    // operator-defined fields as if they were flat columns. Real columns
    // win on key collisions.
    const cv = report.custom_values && typeof report.custom_values === 'object'
      ? report.custom_values
      : {};
    const flat = { ...report };
    for (const [k, v] of Object.entries(cv)) {
      if (!(k in flat) || flat[k] === null || flat[k] === undefined) {
        flat[k] = v;
      }
    }

    // Attach formula_total (sum of shift_formula_results) for parity
    // with the list endpoint so callers can render Banking Total without
    // an extra round-trip.
    const formula_total = formula_results.reduce(
      (acc, fr) => acc + Number(fr?.result_value || 0),
      0,
    );

    const payload = {
      ...flat,
      site_name: report.site?.name,
      site_code: report.site?.code,
      staff_name: report.submitter?.name,
      reviewed_by_name: report.reviewer?.name,
      formula_results,
      formula_total: formula_results.length > 0 ? formula_total : null,
    };
    return NextResponse.json(payload, { headers: corsHeaders });
  } catch (err) {
    console.error('Get report by id error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch report', message: err?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============================================================================
// DELETE /api/reports/:id  (alias: /api/form-submissions/:id)
//
// Admin-only (Owner). Operator + Staff are rejected 403.
// Cascades to shift_formula_results via FK.
// ============================================================================
export async function handleDeleteReport(reportId, request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const me = auth.user;
    if (me.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only owners can delete reports', role: me.role },
        { status: 403, headers: corsHeaders }
      );
    }

    const db = supabaseAdmin || supabase;
    // Fetch the report before delete for audit before_state
    let beforeReport = null;
    try {
      const { data } = await db.from('shift_reports').select('*').eq('id', reportId).single();
      beforeReport = data;
    } catch (_e) { /* best-effort snapshot */ }
    // First, clean up the formula results (no ON DELETE CASCADE assumed).
    try {
      await db.from('shift_formula_results').delete().eq('shift_report_id', reportId);
    } catch (e) {
      console.warn('shift_formula_results cleanup failed:', e?.message);
    }
    const { error } = await db.from('shift_reports').delete().eq('id', reportId);
    if (error) throw error;

    logAuditAsync({
      request,
      actor: me,
      action: 'delete',
      tableName: 'shift_reports',
      recordId: reportId,
      siteId: beforeReport?.site_id,
      before: beforeReport,
    });

    return NextResponse.json(
      { success: true, deleted_id: reportId },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error('Delete report error:', err);
    return NextResponse.json(
      { error: 'Failed to delete report', message: err?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============== SHIFT REPORTS ==============
export async function handleGetReports(request) {
  try {
    // -------- Auth: Bearer token REQUIRED --------
    // GET /api/reports is now role-scoped via the requester's JWT.
    //   owner    → all reports for sites they own
    //   operator → reports for sites assigned to them (operator_site_assignments)
    //   staff    → reports they submitted themselves (submitted_by_user_id = me)
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const me = auth.user;

    const url = new URL(request.url);
    const reqSiteId = url.searchParams.get('siteId');
    const reqSiteIds = url.searchParams.get('siteIds');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const status = url.searchParams.get('status');

    const db = supabaseAdmin || supabase;

    // -------- Resolve which sites this caller can see --------
    let scopedSiteIds = null; // null = no site filter (e.g. staff filter by user)
    if (me.role === 'staff') {
      // Staff: only their own reports (we'll filter by submitted_by_user_id
      // below — no site scope needed)
    } else if (me.role === 'owner') {
      const { data, error } = await db
        .from('sites')
        .select('id')
        .eq('owner_id', me.id);
      if (error) throw error;
      scopedSiteIds = (data || []).map((s) => s.id);
    } else if (me.role === 'operator') {
      const { data, error } = await db
        .from('operator_site_assignments')
        .select('site_id')
        .eq('operator_user_id', me.id);
      if (error) throw error;
      scopedSiteIds = (data || []).map((a) => a.site_id);
    } else {
      return NextResponse.json(
        { error: `Unknown role: ${me.role}` },
        { status: 403, headers: corsHeaders }
      );
    }

    // -------- Intersect requested filter with scope --------
    let effectiveSiteIds = scopedSiteIds;
    if (reqSiteId || reqSiteIds) {
      const requested = reqSiteIds
        ? reqSiteIds.split(',').map((s) => s.trim()).filter(Boolean)
        : [reqSiteId];
      if (me.role === 'staff') {
        // staff can't filter by site (they only see their own reports regardless)
      } else {
        const allowed = new Set(scopedSiteIds || []);
        const filtered = requested.filter((id) => allowed.has(id));
        // If they asked for sites they don't have access to, return empty
        // (don't 403 — could be a legitimate broad query with some out-of-scope items)
        effectiveSiteIds = filtered;
      }
    }

    let query = db
      .from('shift_reports')
      .select(`
        *,
        site:sites(id, name, code),
        submitted_by:users!submitted_by_user_id(id, name, email)
      `)
      .order('date', { ascending: false })
      .order('shift_type', { ascending: true });

    if (me.role === 'staff') {
      query = query.eq('submitted_by_user_id', me.id);
    } else {
      // Owner/Operator must be scoped to their allowed sites
      if (!effectiveSiteIds || effectiveSiteIds.length === 0) {
        return NextResponse.json([], { headers: corsHeaders });
      }
      query = query.in('site_id', effectiveSiteIds);
    }

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (status) query = query.eq('status', status);

    const { data, error } = await query.limit(500);
    if (error) throw error;

    // Spread custom_values JSONB back onto each row so consumers (owner
    // dashboard, operator review list, edit form) see operator-defined
    // fields as if they were flat columns. The real custom_values key is
    // also kept on the row in case anyone wants the structured shape.
    const flattened = (data || []).map((row) => {
      const cv = row.custom_values || {};
      if (!cv || typeof cv !== 'object') return row;
      const flat = { ...row };
      for (const [k, v] of Object.entries(cv)) {
        // Don't clobber real columns if a key collides (real wins).
        if (!(k in flat) || flat[k] === null || flat[k] === undefined) {
          flat[k] = v;
        }
      }
      return flat;
    });

    // BUG 1b: attach the summed banking-formula result per report so the
    // collapsed Banking Submissions row reads the SAME number as the
    // expanded Banking Total card (sum of shift_formula_results). We do
    // this with a single batch query keyed by report id, so it's O(1) DB
    // round-trips regardless of result-set size.
    if (flattened.length > 0) {
      const reportIds = flattened.map((r) => r.id).filter(Boolean);
      const { data: frRows } = await (supabaseAdmin || supabase)
        .from('shift_formula_results')
        .select('shift_report_id, result_value')
        .in('shift_report_id', reportIds);
      const totals = new Map();
      for (const fr of frRows || []) {
        totals.set(
          fr.shift_report_id,
          (totals.get(fr.shift_report_id) || 0) + Number(fr.result_value || 0),
        );
      }
      for (const row of flattened) {
        row.formula_total = totals.get(row.id) ?? null;
      }
    }

    return NextResponse.json(flattened, { headers: corsHeaders });
  } catch (error) {
    console.error('Get reports error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports', detail: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function handleCreateReport(request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Request body must be JSON' },
        { status: 400, headers: corsHeaders }
      );
    }

    // -------- Field-name flexibility --------
    // Accept BOTH `date` and `shift_date` (DB column is `date`).
    // Accept BOTH `shift_type` and `shiftType` (just in case).
    const date = body.date || body.shift_date || null;
    const shift_type = body.shift_type || body.shiftType || null;
    const site_id = body.site_id || body.siteId || null;

    // -------- Auth: Bearer token REQUIRED --------
    // We never trust `submitted_by_user_id` from the request body — it would
    // let any client post reports on behalf of any user. The submitter's
    // identity is taken exclusively from the Supabase JWT.
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const submitted_by_user_id = auth.user.id;

    // -------- Required field validation --------
    const missing = [];
    if (!site_id) missing.push('site_id');
    if (!date) missing.push('date (or shift_date)');
    if (!shift_type) missing.push('shift_type');
    if (missing.length) {
      return NextResponse.json(
        { error: `Missing required field(s): ${missing.join(', ')}` },
        { status: 400, headers: corsHeaders }
      );
    }

    // -------- Build insert payload --------
    // The shift_reports table has a fixed set of columns; anything else
    // the form sends (operator-defined custom fields like ACCOUNT,
    // BANKING, FUEL_CARDS, etc.) must land in the JSONB custom_values
    // column or PostgREST throws "Could not find the 'X' column of
    // 'shift_reports' in the schema cache".
    //
    // Strategy: allow-list keys via SHIFT_REPORT_COLUMNS. Anything in
    // `rest` not in the list gets rolled into custom_values.
    const {
      date: _d,
      shift_date: _sd,
      shift_type: _st,
      shiftType: _shiftType,
      site_id: _siteId,
      siteId: _siteIdAlias,
      submitted_by_user_id: _submitted,
      submittedByUserId: _submittedAlias,
      id: _id, // ignore client-supplied id
      submitted_at: _submittedAt, // we set this ourselves
      status: _status, // we always start as 'pending'
      // -------- Phase 3 wiring: dip-reading fields are NOT columns on
      // shift_reports. Strip them out of the spread; we'll forward them
      // to a dip_readings insert after the shift report is saved.
      dip_ulp_litres,
      dip_diesel_litres,
      dip_premium_litres,
      delivery_ulp_litres,
      delivery_diesel_litres,
      delivery_premium_litres,
      // Custom-grade dips configured per-site via Form Fields → Fuel Tank
      // Dips. Shape: { [field_key]: { level, delivery } }.
      custom_dip_values,
      // If the client already shaped a custom_values blob (e.g. an edit
      // request), respect it as the starting point and merge unknowns
      // we discover below into it.
      custom_values: bodyCustomValues,
      ...rest
    } = body;

    // Allow-list of real columns on shift_reports. Keep in sync with
    // /app/lib/supabase-schema.sql.
    const SHIFT_REPORT_COLUMNS = new Set([
      'id', 'site_id', 'submitted_by_user_id', 'date', 'shift_type',
      'total_sales', 'fuel_sales', 'shop_sales', 'total_litres',
      'eftpos', 'motorpass', 'cash', 'accounts',
      'beverages', 'hot_food',
      'drive_offs', 'dips', 'total_revenue', 'difference_value',
      'notes', 'status', 'submitted_at', 'reviewed_by_user_id', 'reviewed_at',
      'custom_values',
      // P1 — financial integrity (lib/supabase-p1-financial-integrity.sql)
      'reconciles', 'reconciliation_reason', 'submitted_totals',
    ]);

    const knownCols = {};
    const customValues = (bodyCustomValues && typeof bodyCustomValues === 'object' && !Array.isArray(bodyCustomValues))
      ? { ...bodyCustomValues }
      : {};
    for (const [k, v] of Object.entries(rest)) {
      if (SHIFT_REPORT_COLUMNS.has(k)) {
        knownCols[k] = v;
      } else if (v != null && v !== '') {
        // Coerce numeric-looking strings to numbers so dashboards can sum
        // them. JSONB doesn't care about the underlying JS type.
        const num = Number(v);
        customValues[k] = Number.isFinite(num) && String(v).trim() !== '' ? num : v;
      }
    }

    const newReport = {
      ...knownCols,
      id: uuidv4(),
      site_id,
      date,
      shift_type,
      submitted_by_user_id,
      status: 'pending',
      submitted_at: new Date().toISOString(),
      custom_values: customValues,
    };

    // ---- P1 Financial Integrity: canonical totals + reconciliation flag ----
    // Per /app/memory/P1_FINDINGS_REPORT.md decisions:
    //   1. total_revenue ≡ total_sales (collapsed; derived from fuel + shop).
    //   2. Warn + flag (do NOT hard-block) when components don't reconcile.
    //   3. Fold per-grade $ / L from custom_values when fixed col is 0.
    //   4. Preserve the submitter's original-entered values for audit.
    //   5. Tolerance = 1% by default, per-site override via
    //      sites.reconcile_tolerance_pct.
    let p1TolerancePct = DEFAULT_TOLERANCE_PCT;
    try {
      const { data: siteRow } = await (supabaseAdmin || supabase)
        .from('sites')
        .select('reconcile_tolerance_pct')
        .eq('id', site_id)
        .maybeSingle();
      const t = Number(siteRow?.reconcile_tolerance_pct);
      if (Number.isFinite(t) && t >= 0) p1TolerancePct = t;
    } catch (_) { /* fall back to default */ }

    const canonical = computeTotals(newReport, { tolerancePct: p1TolerancePct });
    // Preserve what the submitter typed (audit trail)
    newReport.submitted_totals = canonical.submitted;
    // BUG B fix: DO NOT overwrite user-entered total_sales / total_revenue
    // with the derived canonical value. The submitter's "TOTAL SALES"
    // field (operator-configurable in site_field_configs) is treated as
    // a first-class entry — we persist what they typed so the Raw Field
    // Values grid shows their number, not the derived fuel+shop sum.
    // The P1 reconciliation flag (canonical.reconciles) still fires when
    // the typed total disagrees with components, so the audit trail is
    // preserved without silently discarding operator input.
    //
    // For OTHER columns (fuel_sales / shop_sales / total_litres) the
    // canonical value folds per-grade $/L from custom_values when the
    // fixed column is 0 — that's the intended P1 behavior and is kept.
    if (!(Number(newReport.total_sales) > 0)) {
      // Only fall back to the derived total when the submitter left
      // total_sales blank.
      newReport.total_sales = canonical.total_sales;
    }
    if (!(Number(newReport.total_revenue) > 0)) {
      newReport.total_revenue = canonical.total_revenue;
    }
    newReport.fuel_sales = canonical.fuel_sales;
    newReport.shop_sales = canonical.shop_sales;
    newReport.total_litres = canonical.total_litres;
    newReport.reconciles = canonical.reconciles;
    newReport.reconciliation_reason = canonical.reconciliation_reason;

    const { data: report, error: reportError } = await (supabaseAdmin || supabase)
      .from('shift_reports')
      .insert([newReport])
      .select()
      .single();

    if (reportError) {
      console.error('Create report - insert error:', reportError);
      if (reportError.code === '23505') {
        return NextResponse.json(
          {
            error: `A ${shift_type} report for site ${site_id} on ${date} has already been submitted.`,
            detail: reportError.details || null,
            code: 'duplicate_report',
            existing_constraint: 'shift_reports_site_id_date_shift_type_key',
          },
          { status: 409, headers: corsHeaders }
        );
      }
      if (reportError.code === '23503') {
        return NextResponse.json(
          {
            error: 'Referenced site or user does not exist.',
            detail: reportError.details || reportError.message,
            code: 'foreign_key_violation',
          },
          { status: 400, headers: corsHeaders }
        );
      }
      // Not-null / check / column not exist — surface the DB message in the
      // primary error field so it's visible even to consumers that only read
      // `error` and ignore `detail`.
      return NextResponse.json(
        {
          error: `Database rejected the report: ${reportError.message}`,
          detail: reportError.message,
          hint: reportError.hint || null,
          code: reportError.code || 'db_error',
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Calculate and save formula results for ALL active formulas — not just
    // staff-visible ones. The audit trail (shift_formula_results) is read by
    // operators and owners on the Banking Submissions tab, regardless of
    // whether the staff submitter sees the formula at submit time.
    const { data: formulas } = await (supabaseAdmin || supabase)
      .from('site_banking_formulas')
      .select('*')
      .eq('site_id', site_id)
      .eq('is_active', true);

    if (formulas && formulas.length > 0) {
      const formulaResults = [];
      for (const formula of formulas) {
        const calcResult = await calculateFormula(formula.formula_json, newReport);
        formulaResults.push({
          id: uuidv4(),
          shift_report_id: report.id,
          formula_id: formula.id,
          formula_name: formula.name,
          result_value: calcResult,
        });
      }
      if (formulaResults.length > 0) {
        await (supabaseAdmin || supabase)
          .from('shift_formula_results')
          .insert(formulaResults);
      }
    }

    // -------- Phase 3 wiring: persist any tank-level / delivery values
    // from the shift report into the dip_readings table so the Fuel
    // Inventory dashboard stays in sync. Non-blocking: errors here are
    // logged but the shift report itself stays successful.
    try {
      const toNum = (v) => (v === '' || v == null ? null : Number(v));
      const toNumZero = (v) => (v === '' || v == null ? 0 : Number(v));
      const levels = {
        ulp: toNum(dip_ulp_litres),
        diesel: toNum(dip_diesel_litres),
        premium: toNum(dip_premium_litres),
      };
      const deliveries = {
        ulp: toNumZero(delivery_ulp_litres),
        diesel: toNumZero(delivery_diesel_litres),
        premium: toNumZero(delivery_premium_litres),
      };
      const anyLevel = Object.values(levels).some((v) => v != null);
      const anyDelivery = Object.values(deliveries).some((v) => v > 0);

      // Sanitize custom_dip_values from the form into the same JSON shape
      // dip_readings.custom_values expects: { key: { level, delivery } }.
      const cleanCustom = {};
      if (custom_dip_values && typeof custom_dip_values === 'object' && !Array.isArray(custom_dip_values)) {
        for (const [k, raw] of Object.entries(custom_dip_values)) {
          if (!raw || typeof raw !== 'object') continue;
          const level = toNum(raw.level);
          const delivery = toNumZero(raw.delivery);
          if (level == null && delivery === 0) continue;
          cleanCustom[k] = { level, delivery };
        }
      }
      const anyCustom = Object.keys(cleanCustom).length > 0;

      if (anyLevel || anyDelivery || anyCustom) {
        // Map shift type to a sensible time-of-day so the reading lands
        // on a chronologically correct moment of the shift date.
        const hourByShift = { Morning: 8, Afternoon: 14, Night: 22 };
        const hour = hourByShift[shift_type] ?? 12;
        const readingDate = new Date(`${date}T00:00:00`);
        readingDate.setHours(hour, 0, 0, 0);

        const dipRow = {
          id: uuidv4(),
          site_id,
          // Reuse the submitter user id (column is named operator_user_id
          // for legacy reasons but semantically it's "logged_by"). Staff
          // submissions therefore appear under the staff member who
          // logged them; operators and owners can still edit/delete via
          // the Fuel Inventory dashboard.
          operator_user_id: submitted_by_user_id,
          reading_label: `${shift_type} shift`,
          reading_time: readingDate.toISOString(),
          ulp_litres: levels.ulp,
          diesel_litres: levels.diesel,
          premium_litres: levels.premium,
          deliveries_ulp_litres: deliveries.ulp,
          deliveries_diesel_litres: deliveries.diesel,
          deliveries_premium_litres: deliveries.premium,
          custom_values: cleanCustom,
          notes: `Auto-logged from ${shift_type} shift report ${report.id}`,
        };

        const { error: dipErr } = await (supabaseAdmin || supabase)
          .from('dip_readings')
          .insert([dipRow]);
        if (dipErr) {
          console.error('Create report - dip insert failed (non-fatal):', dipErr);
        }
      }
    } catch (dipBlockErr) {
      console.error('Create report - dip block crashed (non-fatal):', dipBlockErr);
    }

    // -------- Wet-stock Tier 1: per-tank daily reconciliation -----------
    // For every active tank on this site whose grade matches a key in
    // custom_dip_values, compute the day's reconciliation snapshot and
    // upsert into tank_reconciliation. Non-blocking — failures (e.g.
    // missing tables on pre-migration installs) are logged.
    try {
      const { reconcileTank } = await import('@/lib/wetstock-tier1');
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const { data: siteTanks } = await (supabaseAdmin || supabase)
        .from('tanks')
        .select('*')
        .eq('site_id', site_id)
        .eq('active', true);

      if (Array.isArray(siteTanks) && siteTanks.length > 0) {
        const cv = (custom_dip_values && typeof custom_dip_values === 'object') ? custom_dip_values : {};
        // Build lookup: normalised key -> {level, delivery, sales_litres}
        const dipByKey = {};
        for (const [k, raw] of Object.entries(cv)) {
          if (!raw || typeof raw !== 'object') continue;
          dipByKey[norm(k)] = raw;
        }
        // Also include the legacy ULP/Diesel/Premium columns under their
        // canonical normalised keys so reconciliation works for sites
        // without custom dip configs. (sales_litres_* not yet captured
        // for legacy sites, but level/delivery still flow.)
        const legacyMap = {
          ulp: { level: dip_ulp_litres, delivery: delivery_ulp_litres },
          diesel: { level: dip_diesel_litres, delivery: delivery_diesel_litres },
          premium: { level: dip_premium_litres, delivery: delivery_premium_litres },
        };
        for (const [k, v] of Object.entries(legacyMap)) {
          if (!dipByKey[k] && (v.level != null || v.delivery != null || v.sales_litres != null)) {
            dipByKey[k] = v;
          }
        }

        const upserts = [];
        for (const t of siteTanks) {
          const nk = norm(t.grade);
          const dip = dipByKey[nk];
          // Find prior-day closing for chain continuity.
          const { data: prior } = await (supabaseAdmin || supabase)
            .from('tank_reconciliation')
            .select('actual_closing, date')
            .eq('tank_id', t.id)
            .lt('date', date)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();

          const priorClosing = prior?.actual_closing;
          const chainBroken = priorClosing == null;

          if (!dip && chainBroken) continue; // nothing to reconcile yet

          const openingLitres = chainBroken
            // No prior reading — fall back to today's level as opening, but
            // flag chain_broken so the operator sees it on the dashboard.
            ? (dip?.opening_litres ?? dip?.level ?? 0)
            : Number(priorClosing);

          const computed = reconcileTank({
            tank_id: t.id,
            site_id,
            date,
            opening_litres: openingLitres,
            delivery_litres: dip?.delivery ?? 0,
            sales_litres: dip?.sales_litres ?? 0,
            actual_closing: dip?.level ?? null,
            tolerance_pct: t.tolerance_pct,
            chain_broken: chainBroken,
          });

          upserts.push({ id: uuidv4(), ...computed });
        }

        if (upserts.length > 0) {
          const { error: tErr } = await (supabaseAdmin || supabase)
            .from('tank_reconciliation')
            .upsert(upserts, { onConflict: 'tank_id,date' });
          if (tErr) console.error('[wetstock-tier1] upsert failed (non-fatal):', tErr.message);
        }
      }
    } catch (wsErr) {
      console.error('[wetstock-tier1] reconciliation block crashed (non-fatal):', wsErr?.message);
    }

    logAuditAsync({
      request,
      actor: { id: submitted_by_user_id, email: auth.user?.email, role: auth.user?.role },
      action: 'insert',
      tableName: 'shift_reports',
      recordId: report.id,
      siteId: site_id,
      after: report,
      metadata: { shift_type, date },
    });

    // -------- Phase 2 Section E: notify operators of the site --------
    // Fan out a notification to every operator currently assigned to this
    // site so they know there's a new submission waiting for review. Fire-
    // and-forget; failures must NOT break the submission response.
    notifyOperatorsOfSite({
      siteId: site_id,
      type: 'report_submitted',
      title: 'New shift report to review',
      body: `${auth.user?.name || 'A staff member'} submitted a ${shift_type} shift report for ${date}.`,
      link: `/app?tab=submissions`,
      excludeUserId: submitted_by_user_id,
    }).catch((e) => console.warn('[notify] report_submitted fan-out failed:', e?.message));

    return NextResponse.json(report, { status: 201, headers: corsHeaders });
  } catch (error) {
    console.error('Create report - unhandled error:', error);
    return NextResponse.json(
      {
        error: 'Failed to create report',
        detail: error?.message || String(error),
      },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function handleUpdateReportStatus(reportId, request) {
  try {
    const { status, reviewed_by_user_id } = await request.json();
    
    const db = supabaseAdmin || supabase;
    // Fetch before-state for audit
    let before = null;
    try { const { data } = await db.from('shift_reports').select('*').eq('id', reportId).single(); before = data; } catch (_e) { /* best-effort snapshot */ }
    
    const updates = {
      status,
      reviewed_by_user_id,
      reviewed_at: new Date().toISOString()
    };
    
    const { data, error } = await db
      .from('shift_reports')
      .update(updates)
      .eq('id', reportId)
      .select()
      .single();
    
    if (error) throw error;

    logAuditAsync({
      request,
      actorUserIdOverride: reviewed_by_user_id,
      action: 'update',
      tableName: 'shift_reports',
      recordId: reportId,
      siteId: data?.site_id,
      before,
      after: data,
      metadata: { reason: 'status_change', new_status: status },
    });

    // -------- Phase 2 Section E: notify the original submitter --------
    // Only fire when the status actually changed from what was previously
    // stored, and only for the user-facing transitions (approved/rejected/
    // needs_changes). Skip transitions back to 'pending' since that's
    // typically a no-op internal correction.
    const submitterId = data?.submitted_by_user_id;
    const prevStatus = before?.status;
    const meaningful = ['approved', 'rejected', 'needs_changes'];
    if (submitterId && status && prevStatus !== status && meaningful.includes(status)) {
      const titleByStatus = {
        approved: 'Your shift report was approved',
        rejected: 'Your shift report was rejected',
        needs_changes: 'Your shift report needs changes',
      };
      const bodyByStatus = {
        approved: 'Your report has been reviewed and approved.',
        rejected: 'Your operator has rejected the report. See the dashboard for details.',
        needs_changes: 'Your operator has requested changes. Please review the feedback on the report.',
      };
      notify({
        userId: submitterId,
        type: 'report_status_changed',
        title: titleByStatus[status],
        body: bodyByStatus[status],
        link: `/app?tab=history`,
      }).catch((e) => console.warn('[notify] report_status_changed failed:', e?.message));
    }

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update report status error:', error);
    return NextResponse.json({ error: 'Failed to update report status' }, { status: 500, headers: corsHeaders });
  }
}

// Helper function to calculate formula
function calculateFormula(formula_json, shift_data) {
  try {
    const operations = JSON.parse(formula_json).operations || [];
    let result = 0;
    let currentOp = '+';
    
    for (const op of operations) {
      if (op.type === 'field') {
        const value = parseFloat(shift_data[op.value] || 0);
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
    
    return Math.round(result * 100) / 100;
  } catch (error) {
    console.error('Formula calculation error:', error);
    return 0;
  }
}

