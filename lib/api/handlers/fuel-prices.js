/**
 * Fuel Prices module — competitor sites, fuel price entries, competitor
 * prices, and the price-comparison report.
 *
 * Phase 2 final extraction from catch-all route.js.
 *
 * Endpoints:
 *   GET    /api/site-competitors
 *   POST   /api/site-competitors
 *   PUT    /api/site-competitors/:id
 *   DELETE /api/site-competitors/:id
 *   GET    /api/fuel-price-entries
 *   POST   /api/fuel-price-entries
 *   PUT    /api/fuel-price-entries/:id
 *   GET    /api/competitor-prices
 *   POST   /api/competitor-prices
 *   PUT    /api/competitor-prices/:id
 *   DELETE /api/competitor-prices/:id
 *   GET    /api/fuel-price-comparison
 *
 * (Live QLD FPM endpoints are already in /app/lib/api/handlers/fuel-prices-live.js)
 */

import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api/cors';
import supabase, { supabaseAdmin } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { verifyAuth } from '@/lib/auth-helpers';
import { logAuditAsync } from '@/lib/api/audit';

export async function handleGetSiteCompetitors(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId');
    
    if (!siteId) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400, headers: corsHeaders });
    }
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('site_competitors')
      .select('*')
      .eq('site_id', siteId);
    
    if (error) throw error;
    
    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get site competitors error:', error);
    return NextResponse.json({ error: 'Failed to fetch competitors' }, { status: 500, headers: corsHeaders });
  }
}

export async function handleCreateSiteCompetitor(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const body = await request.json();
    
    const newCompetitor = {
      id: uuidv4(),
      ...body
    };
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('site_competitors')
      .insert([newCompetitor])
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create competitor error:', error);
    return NextResponse.json({ error: 'Failed to create competitor' }, { status: 500, headers: corsHeaders });
  }
}

export async function handleUpdateSiteCompetitor(competitorId, request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const updates = await request.json();
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('site_competitors')
      .update(updates)
      .eq('id', competitorId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update competitor error:', error);
    return NextResponse.json({ error: 'Failed to update competitor' }, { status: 500, headers: corsHeaders });
  }
}

export async function handleDeleteSiteCompetitor(competitorId, request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const { error } = await (supabaseAdmin || supabase)
      .from('site_competitors')
      .delete()
      .eq('id', competitorId);
    
    if (error) throw error;
    
    return NextResponse.json({ message: 'Competitor deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete competitor error:', error);
    return NextResponse.json({ error: 'Failed to delete competitor' }, { status: 500, headers: corsHeaders });
  }
}

export async function handleGetFuelPriceEntries(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const url = new URL(request.url);
    const siteId = url.searchParams.get('siteId');
    const date = url.searchParams.get('date');
    
    let query = (supabaseAdmin || supabase)
      .from('fuel_price_entries')
      .select('*')
      .order('date', { ascending: false });
    
    if (siteId) query = query.eq('site_id', siteId);
    if (date) query = query.eq('date', date);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get fuel price entries error:', error);
    return NextResponse.json({ error: 'Failed to fetch fuel prices' }, { status: 500, headers: corsHeaders });
  }
}

export async function handleCreateFuelPriceEntry(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const body = await request.json();
    
    const newEntry = {
      id: uuidv4(),
      ...body,
      // Always overwrite entered_by_user_id with the authenticated user to
      // prevent impersonation. NOT NULL FK in DB.
      entered_by_user_id: auth.user.id,
      entered_at: new Date().toISOString()
    };
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('fuel_price_entries')
      .insert([newEntry])
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create fuel price entry error:', error);
    return NextResponse.json({ error: 'Failed to create fuel price entry' }, { status: 500, headers: corsHeaders });
  }
}

export async function handleUpdateFuelPriceEntry(entryId, request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const updates = await request.json();
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('fuel_price_entries')
      .update(updates)
      .eq('id', entryId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update fuel price entry error:', error);
    return NextResponse.json({ error: 'Failed to update fuel price entry' }, { status: 500, headers: corsHeaders });
  }
}

export async function handleGetCompetitorPrices(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const url = new URL(request.url);
    const competitorId = url.searchParams.get('competitorId');
    const siteId = url.searchParams.get('siteId');
    const date = url.searchParams.get('date');
    
    let query = (supabaseAdmin || supabase)
      .from('competitor_fuel_prices')
      .select('*')
      .order('date', { ascending: false });
    
    if (competitorId) query = query.eq('competitor_id', competitorId);
    if (siteId) query = query.eq('site_id', siteId);
    if (date) query = query.eq('date', date);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    return NextResponse.json(data || [], { headers: corsHeaders });
  } catch (error) {
    console.error('Get competitor prices error:', error);
    return NextResponse.json({ error: 'Failed to fetch competitor prices' }, { status: 500, headers: corsHeaders });
  }
}

export async function handleCreateCompetitorPrice(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const body = await request.json();
    
    const newPrice = {
      id: uuidv4(),
      ...body,
      // Always overwrite entered_by_user_id with the authenticated user to
      // prevent impersonation. NOT NULL FK in DB.
      entered_by_user_id: auth.user.id,
      entered_at: new Date().toISOString()
    };
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('competitor_fuel_prices')
      .insert([newPrice])
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Create competitor price error:', error);
    return NextResponse.json({ error: 'Failed to create competitor price' }, { status: 500, headers: corsHeaders });
  }
}

export async function handleUpdateCompetitorPrice(priceId, request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const updates = await request.json();
    
    const { data, error } = await (supabaseAdmin || supabase)
      .from('competitor_fuel_prices')
      .update(updates)
      .eq('id', priceId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error('Update competitor price error:', error);
    return NextResponse.json({ error: 'Failed to update competitor price' }, { status: 500, headers: corsHeaders });
  }
}

export async function handleDeleteCompetitorPrice(priceId, request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const { error } = await (supabaseAdmin || supabase)
      .from('competitor_fuel_prices')
      .delete()
      .eq('id', priceId);
    
    if (error) throw error;
    
    return NextResponse.json({ message: 'Competitor price deleted' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Delete competitor price error:', error);
    return NextResponse.json({ error: 'Failed to delete competitor price' }, { status: 500, headers: corsHeaders });
  }
}

export async function handleGetFuelPriceComparison(request) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.ok) {
      const r = auth.response;
      Object.entries(corsHeaders).forEach(([k, v]) => r.headers.set(k, v));
      return r;
    }
    const url = new URL(request.url);
    // Frontend sends ?siteIds=a,b,c (plural). Older callers send ?siteId=. Accept both.
    let siteIdList = [];
    const single = url.searchParams.get('siteId');
    const plural = url.searchParams.get('siteIds');
    if (plural) {
      siteIdList = plural.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (single) {
      siteIdList = [single];
    }
    const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!siteIdList.length) {
      return NextResponse.json(
        { error: 'siteId or siteIds is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const db = supabaseAdmin || supabase;

    // Bulk fetch sites + own prices + competitors + competitor prices
    const [sitesRes, ownPricesRes, compsRes] = await Promise.all([
      db
        .from('sites')
        .select('id, name, code, latitude, longitude')
        .in('id', siteIdList),
      db
        .from('fuel_price_entries')
        .select('site_id, fuel_type, price, date, entered_at')
        .in('site_id', siteIdList)
        .eq('date', date),
      db
        .from('site_competitors')
        .select('id, site_id, competitor_name, distance_km, latitude, longitude')
        .in('site_id', siteIdList),
    ]);
    if (sitesRes.error) throw sitesRes.error;
    if (ownPricesRes.error) throw ownPricesRes.error;
    if (compsRes.error) throw compsRes.error;

    const sites = sitesRes.data || [];
    const ownPrices = ownPricesRes.data || [];
    const competitors = compsRes.data || [];

    const competitorIds = competitors.map((c) => c.id);
    let competitorPrices = [];
    if (competitorIds.length) {
      const cpRes = await db
        .from('competitor_fuel_prices')
        .select('competitor_id, site_id, fuel_type, price, date, entered_at')
        .in('competitor_id', competitorIds)
        .eq('date', date);
      if (cpRes.error) throw cpRes.error;
      competitorPrices = cpRes.data || [];
    }

    const FUEL_TYPES = ['ULP', 'Premium', 'Diesel'];

    // Build one comparison entry per site
    const result = siteIdList.map((siteId) => {
      const site = sites.find((s) => s.id === siteId) || { id: siteId };
      const siteComps = competitors.filter((c) => c.site_id === siteId);
      const siteCompPrices = competitorPrices.filter((p) => p.site_id === siteId);
      const siteOwnPrices = ownPrices.filter((p) => p.site_id === siteId);

      const fuelData = {};
      const insights = [];

      for (const ft of FUEL_TYPES) {
        // Latest own price for this fuel type (today)
        const own = siteOwnPrices
          .filter((p) => p.fuel_type === ft)
          .sort(
            (a, b) =>
              new Date(b.entered_at || 0).getTime() -
              new Date(a.entered_at || 0).getTime()
          )[0];

        // Latest competitor price per competitor for this fuel type
        const compByCompetitor = new Map();
        for (const cp of siteCompPrices.filter((p) => p.fuel_type === ft)) {
          const t = cp.entered_at ? new Date(cp.entered_at).getTime() : 0;
          const cur = compByCompetitor.get(cp.competitor_id);
          if (!cur || t > cur._t) compByCompetitor.set(cp.competitor_id, { ...cp, _t: t });
        }
        const compPriceList = Array.from(compByCompetitor.values()).map((cp) => {
          const meta = siteComps.find((c) => c.id === cp.competitor_id) || {};
          return {
            competitor_id: cp.competitor_id,
            competitor_name: meta.competitor_name || null,
            distance_km: meta.distance_km ?? null,
            latitude: meta.latitude ?? null,
            longitude: meta.longitude ?? null,
            price: cp.price,
            entered_at: cp.entered_at,
          };
        });

        const numericComps = compPriceList
          .map((c) => Number(c.price))
          .filter((n) => Number.isFinite(n));
        const minCp = numericComps.length ? Math.min(...numericComps) : null;
        const maxCp = numericComps.length ? Math.max(...numericComps) : null;
        const ownPrice = own ? Number(own.price) : null;

        const fmt = (n) =>
          n === null || n === undefined
            ? null
            : (Math.round(n * 10) / 10).toFixed(1);
        const diffMin =
          ownPrice !== null && minCp !== null
            ? Math.round((ownPrice - minCp) * 10) / 10
            : null;
        const diffMax =
          ownPrice !== null && maxCp !== null
            ? Math.round((ownPrice - maxCp) * 10) / 10
            : null;

        fuelData[ft] = {
          own_price: ownPrice,
          min_competitor_price: minCp,
          max_competitor_price: maxCp,
          competitor_count: compPriceList.length,
          difference_from_min: diffMin === null ? null : (diffMin > 0 ? '+' : '') + diffMin.toFixed(1),
          difference_from_max: diffMax === null ? null : (diffMax > 0 ? '+' : '') + diffMax.toFixed(1),
          competitor_prices: compPriceList,
        };

        // Insight rule of thumb (cents per litre):
        //   |diff| <= 0.5  → good
        //   diff > 0.5 && <= 2.0  → neutral
        //   diff > 2.0 && <= 4.0  → warning
        //   diff > 4.0  → danger
        //   diff < -0.5 → good (well below min)
        if (diffMin !== null) {
          let type = 'neutral';
          let message = '';
          if (diffMin <= 0.5) {
            type = 'good';
            message = `${ft} priced competitively (within 0.5¢ of nearest)`;
          } else if (diffMin <= 2.0) {
            type = 'neutral';
            message = `${ft} slightly above lowest competitor (+${diffMin.toFixed(1)}¢)`;
          } else if (diffMin <= 4.0) {
            type = 'warning';
            message = `${ft} significantly above nearest competitors (+${diffMin.toFixed(1)}¢)`;
          } else {
            type = 'danger';
            message = `${ft} far above lowest competitor (+${diffMin.toFixed(1)}¢) — consider price review`;
          }
          insights.push({ type, fuel_type: ft, difference_from_min: diffMin, message });
        }
      }

      return {
        site_id: site.id,
        site_name: site.name || null,
        site_code: site.code || null,
        latitude: site.latitude ?? null,
        longitude: site.longitude ?? null,
        date,
        fuel_data: fuelData,
        insights,
      };
    });

    return NextResponse.json(result, { headers: corsHeaders });
  } catch (error) {
    console.error('Get fuel price comparison error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fuel price comparison', message: error?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ============== EXPORT ==============
