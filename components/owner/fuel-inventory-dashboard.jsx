'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Droplets, Fuel, Loader2, RefreshCw, TrendingDown, AlertTriangle,
  CalendarDays, Truck,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { authedFetch } from '@/lib/authed-fetch';
import { formatDateTime } from '@/lib/format';

/**
 * FuelInventoryDashboard — Owner-facing read-only view of tank levels &
 * consumption trends across all owned sites. Lets the owner spot low-fuel
 * sites and plan deliveries.
 *
 * Pulls:
 *   - GET /api/dips/current        (latest reading per site + consumption since previous)
 *   - GET /api/dips/trends?days=7  (daily consumption per site, plus 7-day average)
 */
export default function FuelInventoryDashboard({ user, sites }) {
  const [current, setCurrent] = useState([]);
  const [trends, setTrends] = useState(null);
  const [days, setDays] = useState(7);
  const [siteFilter, setSiteFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [curRes, trRes] = await Promise.all([
        authedFetch('/api/dips/current'),
        authedFetch(`/api/dips/trends?days=${days}`),
      ]);
      const [curData, trData] = await Promise.all([curRes.json(), trRes.json()]);
      setCurrent(Array.isArray(curData) ? curData : []);
      setTrends(trData && Array.isArray(trData.sites) ? trData : { days, sites: [] });
    } catch (err) {
      console.error('Failed to load fuel inventory:', err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const fmtL = (v) =>
    v == null || isNaN(Number(v)) ? '—' : `${Number(v).toLocaleString('en-AU', { maximumFractionDigits: 0 })} L`;

  const visibleSites = siteFilter === 'all'
    ? sites
    : sites.filter((s) => s.id === siteFilter);

  // Portfolio-level KPIs across all sites
  const portfolio = current.reduce(
    (acc, c) => {
      const fuels = ['ulp', 'diesel', 'premium'];
      for (const f of fuels) {
        const lvl = c.current?.[`${f}_litres`];
        if (lvl != null) acc.levels[f] += Number(lvl);
      }
      if (c.current) acc.sitesWithData += 1;
      return acc;
    },
    { levels: { ulp: 0, diesel: 0, premium: 0 }, sitesWithData: 0 }
  );

  // Build chart data: rows are dates, one series per site for selected fuel
  const buildChartSeries = (fuel) => {
    if (!trends?.sites?.length) return { data: [], siteIds: [] };
    const trendsForVisible = trends.sites.filter((s) =>
      siteFilter === 'all' ? true : s.site_id === siteFilter
    );
    if (!trendsForVisible.length) return { data: [], siteIds: [] };
    const dayMap = new Map();
    for (const s of trendsForVisible) {
      for (const d of s.daily) {
        const row = dayMap.get(d.date) || { date: d.date };
        row[s.site_id] = d.consumption[fuel];
        dayMap.set(d.date, row);
      }
    }
    return {
      data: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      siteIds: trendsForVisible.map((s) => s.site_id),
    };
  };

  const seriesColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
  const siteNameById = Object.fromEntries(sites.map((s) => [s.id, s.name]));

  // Low-fuel alerts: under 2000 L on a fuel grade that is being tracked
  const lowFuelAlerts = [];
  for (const c of current) {
    if (!c.current) continue;
    for (const f of ['ulp', 'diesel', 'premium']) {
      const lvl = c.current[`${f}_litres`];
      if (lvl != null && Number(lvl) < 2000) {
        const site = sites.find((s) => s.id === c.site_id);
        lowFuelAlerts.push({
          site_id: c.site_id,
          site_name: site?.name || c.site_id,
          fuel: f,
          litres: Number(lvl),
        });
      }
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Filters bar */}
      <Card className="border border-border/50 shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Site</span>
            <Select value={siteFilter} onValueChange={setSiteFilter}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Window</span>
            <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v, 10))}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="14">14 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={load} className="ml-auto">
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>
      ) : (
        <>
          {/* Portfolio KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { f: 'ulp',     label: 'ULP across portfolio',     bg: 'bg-teal-50',   text: 'text-teal-800',   sub: 'text-teal-700',   icon: 'text-teal-600',   accent: 'border-l-4 border-teal-500' },
              { f: 'diesel',  label: 'Diesel across portfolio',  bg: 'bg-amber-50',  text: 'text-amber-800',  sub: 'text-amber-700',  icon: 'text-amber-600',  accent: 'border-l-4 border-amber-500' },
              { f: 'premium', label: 'Premium across portfolio', bg: 'bg-violet-50', text: 'text-violet-800', sub: 'text-violet-700', icon: 'text-violet-600', accent: 'border-l-4 border-violet-500' },
            ].map((it) => (
              <Card key={it.f} className={`overflow-hidden border border-border/50 shadow-sm ${it.accent}`}>
                <div className={`${it.bg} p-5`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm ${it.sub}`}>{it.label}</p>
                      <p className={`text-3xl font-bold mt-1 ${it.text}`}>{fmtL(portfolio.levels[it.f])}</p>
                      <p className={`text-xs ${it.sub} mt-1 opacity-80`}>{portfolio.sitesWithData} site(s) reporting</p>
                    </div>
                    <Fuel className={`h-7 w-7 ${it.icon}`} />
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Low fuel alerts */}
          {lowFuelAlerts.length > 0 && (
            <Card className="border border-border/50 shadow-sm bg-amber-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-amber-900">
                  <AlertTriangle className="h-5 w-5" /> Low fuel — consider scheduling deliveries
                </CardTitle>
                <CardDescription className="text-amber-800">
                  Tanks below 2,000 L based on latest reported reading.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {lowFuelAlerts.map((a, i) => (
                    <Badge key={i} variant="outline" className="bg-white border-amber-300 text-amber-900">
                      <Droplets className="h-3 w-3 mr-1" />
                      {a.site_name} — {a.fuel.toUpperCase()}: {fmtL(a.litres)}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-site current levels */}
          <Card className="border border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Droplets className="h-5 w-5" /> Current tank levels per site
              </CardTitle>
              <CardDescription>Latest reading reported by the operator, including consumption since the previous reading.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-2">Site</th>
                      <th className="py-2 pr-2">Last reading</th>
                      <th className="py-2 pr-2 text-right">ULP (L)</th>
                      <th className="py-2 pr-2 text-right">Diesel (L)</th>
                      <th className="py-2 pr-2 text-right">Premium (L)</th>
                      <th className="py-2 pr-2 text-right">Consumed since last</th>
                      <th className="py-2 pr-2">Deliveries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSites.map((s) => {
                      const c = current.find((x) => x.site_id === s.id);
                      const cur = c?.current;
                      const cons = c?.consumption_since_previous;
                      const deliveries = cur ? {
                        ulp: Number(cur.deliveries_ulp_litres || 0),
                        diesel: Number(cur.deliveries_diesel_litres || 0),
                        premium: Number(cur.deliveries_premium_litres || 0),
                      } : null;
                      return (
                        <tr key={s.id} className="border-b hover:bg-slate-50 align-top">
                          <td className="py-2 pr-2 font-medium">{s.name}</td>
                          <td className="py-2 pr-2 text-xs text-muted-foreground whitespace-nowrap">
                            {cur ? (
                              <>
                                {formatDateTime(cur.reading_time)}
                                {cur.reading_label ? <span className="block">{cur.reading_label}</span> : null}
                              </>
                            ) : 'No readings yet'}
                          </td>
                          <td className="py-2 pr-2 text-right">{fmtL(cur?.ulp_litres)}</td>
                          <td className="py-2 pr-2 text-right">{fmtL(cur?.diesel_litres)}</td>
                          <td className="py-2 pr-2 text-right">{fmtL(cur?.premium_litres)}</td>
                          <td className="py-2 pr-2 text-right text-xs">
                            {cons ? (
                              <div className="space-y-0.5">
                                {cons.ulp != null && <div>ULP: {fmtL(cons.ulp)}</div>}
                                {cons.diesel != null && <div>Diesel: {fmtL(cons.diesel)}</div>}
                                {cons.premium != null && <div>Premium: {fmtL(cons.premium)}</div>}
                              </div>
                            ) : '—'}
                          </td>
                          <td className="py-2 pr-2 text-xs text-muted-foreground">
                            {deliveries && (deliveries.ulp || deliveries.diesel || deliveries.premium) ? (
                              <div className="space-y-0.5">
                                {deliveries.ulp > 0 && <div><Truck className="h-3 w-3 inline mr-1" />ULP +{fmtL(deliveries.ulp)}</div>}
                                {deliveries.diesel > 0 && <div><Truck className="h-3 w-3 inline mr-1" />Diesel +{fmtL(deliveries.diesel)}</div>}
                                {deliveries.premium > 0 && <div><Truck className="h-3 w-3 inline mr-1" />Prem +{fmtL(deliveries.premium)}</div>}
                              </div>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Consumption trends */}
          <Card className="border border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingDown className="h-5 w-5" /> Daily consumption — last {days} days
              </CardTitle>
              <CardDescription>
                Computed as <code>previous − current + deliveries</code> over each calendar day. Days with fewer than 2 readings are blank.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              {['ulp', 'diesel', 'premium'].map((fuel) => {
                const { data, siteIds } = buildChartSeries(fuel);
                if (data.length === 0) {
                  return (
                    <div key={fuel}>
                      <h4 className="text-sm font-semibold mb-2">{fuel.toUpperCase()}</h4>
                      <p className="text-sm text-muted-foreground">No data for this fuel in the selected window.</p>
                    </div>
                  );
                }
                return (
                  <div key={fuel}>
                    <h4 className="text-sm font-semibold mb-2">{fuel.toUpperCase()} — daily consumption (litres)</h4>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(d) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                          className="text-xs"
                        />
                        <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} className="text-xs" />
                        <Tooltip
                          formatter={(value, name) => [value == null ? '—' : `${Math.round(value).toLocaleString('en-AU')} L`, siteNameById[name] || name]}
                          labelFormatter={(d) => new Date(d).toLocaleDateString('en-AU')}
                        />
                        <Legend formatter={(value) => siteNameById[value] || value} />
                        {siteIds.map((sid, i) => (
                          <Line
                            key={sid}
                            type="monotone"
                            dataKey={sid}
                            stroke={seriesColors[i % seriesColors.length]}
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            connectNulls={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Per-site averages */}
          <Card className="border border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5" /> {days}-day average daily consumption per site
              </CardTitle>
              <CardDescription>Use this to plan delivery schedules.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-2">Site</th>
                      <th className="py-2 pr-2 text-right">ULP avg/day</th>
                      <th className="py-2 pr-2 text-right">Diesel avg/day</th>
                      <th className="py-2 pr-2 text-right">Premium avg/day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleSites.map((s) => {
                      const t = trends?.sites?.find((x) => x.site_id === s.id);
                      const avg = t?.average_consumption;
                      return (
                        <tr key={s.id} className="border-b hover:bg-slate-50">
                          <td className="py-2 pr-2 font-medium">{s.name}</td>
                          <td className="py-2 pr-2 text-right">{fmtL(avg?.ulp)}</td>
                          <td className="py-2 pr-2 text-right">{fmtL(avg?.diesel)}</td>
                          <td className="py-2 pr-2 text-right">{fmtL(avg?.premium)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
