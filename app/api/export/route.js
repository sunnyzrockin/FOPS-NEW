import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api/cors';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { verifyAuth } from '@/lib/auth-helpers';
import { getAllowedSiteIds } from '@/lib/api/site-access';
import * as XLSX from 'xlsx';

// Heavy dependency (xlsx ~1MB). Isolated to its own route so the catch-all
// bundle stays small for the dozens of other endpoints.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request) {
  try {
    // -------- AUTH (Fix 1) --------
    // Previously this endpoint was UNAUTHENTICATED and returned full shift-
    // report financials for any siteIds the caller passed. We now require a
    // valid Bearer token AND intersect the requested siteIds with the
    // caller's allowed sites (owner -> sites they own, operator/staff ->
    // assignment tables) before querying. Empty intersection => 403.
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }

    const url = new URL(request.url);
    const siteIds = url.searchParams.get('siteIds');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const viewType = (url.searchParams.get('viewType') || 'shift').toLowerCase();
    const format = (url.searchParams.get('format') || 'xlsx').toLowerCase();

    if (!siteIds) {
      return NextResponse.json(
        { error: 'siteIds is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const requested = siteIds.split(',').map((s) => s.trim()).filter(Boolean);
    const allowed = await getAllowedSiteIds(auth.user);
    const allowedSet = new Set(allowed);
    const siteIdArray = requested.filter((id) => allowedSet.has(id));
    if (siteIdArray.length === 0) {
      return NextResponse.json(
        { error: 'You are not authorised to export data for the requested sites.' },
        { status: 403, headers: corsHeaders }
      );
    }

    const client = supabaseAdmin || supabase;

    let query = client
      .from('shift_reports')
      .select(`
        *,
        site:sites(name, code),
        submitted_by:users!submitted_by_user_id(name)
      `)
      .in('site_id', siteIdArray)
      .order('date', { ascending: false });

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data: reports, error } = await query;
    if (error) throw error;

    const exportData = (reports || []).map((report) => ({
      Date: report.date,
      Site: report.site?.name || '',
      'Site Code': report.site?.code || '',
      'Shift Type': report.shift_type,
      'Staff Member': report.submitted_by?.name || '',
      'Total Sales': report.total_sales,
      'Fuel Sales': report.fuel_sales,
      'Shop Sales': report.shop_sales,
      'Total Litres': report.total_litres,
      EFTPOS: report.eftpos,
      Motorpass: report.motorpass,
      Cash: report.cash,
      Accounts: report.accounts,
      'Drive Offs': report.drive_offs,
      Status: report.status,
      'Submitted At': report.submitted_at
        ? new Date(report.submitted_at).toLocaleString()
        : '',
    }));

    // JSON branch: used by the client-side PDF generator in ExportDialog.
    // Returns the same exportData rows the XLSX branch would have written.
    if (format === 'json') {
      return NextResponse.json(
        { rows: exportData, viewType, startDate, endDate },
        { headers: corsHeaders }
      );
    }

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Shift Reports');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // FOPS-branded, content-aware filename: FOPS_{ViewType}_{from}_to_{to}.xlsx
    const viewLabel = viewType === 'daily' ? 'DailySummary' : 'ShiftReports';
    const fromTag = startDate || 'all';
    const toTag = endDate || 'all';
    const filename = `FOPS_${viewLabel}_${fromTag}_to_${toTag}.xlsx`;

    return new NextResponse(buf, {
      headers: {
        ...corsHeaders,
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export data', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
