'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * PriceChangeHistory — Owner / Operator view of recent fuel price changes
 * with their operator-acceptance status. Pulls /api/fuel-prices/history
 * (Bearer-locked). Allows filtering by site and window (7/14/30/60/90).
 * Extracted from /app/app/app/page.js.
 */
export default function PriceChangeHistory({ user, sites }) {
  // eslint-disable-next-line no-unused-vars
  const _user = user; // referenced by callers; not needed here
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);
  const [siteFilter, setSiteFilter] = useState('all');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ days: String(days) });
      if (siteFilter !== 'all') q.set('siteId', siteFilter);
      const res = await authedFetch(`/api/fuel-prices/history?${q.toString()}`);
      if (!res.ok) {
        // Don't hard-redirect on 401 — authedFetch already retried with a
        // refreshed token. Falling through with an empty list lets the user
        // refresh/retry instead of being booted out on a transient hiccup.
        const err = await res.json().catch(() => ({}));
        console.warn('history load failed:', err);
        setRows([]);
        return;
      }
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('history load error:', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [days, siteFilter]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Price Change History</h2>
          <p className="text-muted-foreground">Recent fuel price changes and their acknowledgment status.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v, 10))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadHistory} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading history...
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No fuel price changes in the selected window.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Site</th>
                    <th className="px-4 py-3">Fuel</th>
                    <th className="px-4 py-3">Price Change</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Operator Status</th>
                    <th className="px-4 py-3">Staff Acks</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((pc) => {
                    const diff = pc.price_change;
                    const diffColor = diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : '';
                    const diffSign = diff > 0 ? '+' : '';
                    const statusVariant = pc.status === 'escalated' ? 'destructive'
                      : pc.status === 'acknowledged' ? 'default' : 'secondary';
                    const acceptedSummaryClass = pc.operator_acked_at
                      ? 'text-green-700 font-medium' : 'text-muted-foreground';
                    return (
                      <tr key={pc.id} className="border-t">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(pc.created_at)}</td>
                        <td className="px-4 py-3">{pc.site_name || pc.site_id}</td>
                        <td className="px-4 py-3 font-medium">{pc.fuel_type}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-muted-foreground">{pc.old_price}</span>
                          <span className="mx-1">→</span>
                          <span className="font-semibold">{pc.new_price}</span>
                          {diff !== null && (
                            <span className={`ml-2 text-xs ${diffColor}`}>({diffSign}{diff})</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusVariant}>{pc.status}</Badge>
                        </td>
                        <td className={`px-4 py-3 max-w-xs ${acceptedSummaryClass}`}>
                          {pc.acknowledgment_summary}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {pc.staff_ack_count > 0 ? (
                            <span className="text-green-700">✓ {pc.staff_ack_count}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
