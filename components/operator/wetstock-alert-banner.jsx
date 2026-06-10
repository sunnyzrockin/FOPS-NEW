'use client';
/* eslint-disable react-hooks/set-state-in-effect -- async fetch in effect */

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Activity, ChevronRight } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * WetstockAlertBanner — top-of-dashboard banner that surfaces wet-stock
 * sites with status='alert' (red) or 'watch' (amber) from the
 * /api/wetstock/reconciliation endpoint over the last 7 days. Clicking
 * the CTA jumps the user to the Wet-stock tab via the parent setter.
 *
 * Auto-hides when there are no red/amber sites.
 */
export default function WetstockAlertBanner({ siteIds, onJumpToWetstock }) {
  const [counts, setCounts] = useState({ alert: 0, watch: 0, sites: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!siteIds) { setLoading(false); return; }
    (async () => {
      try {
        const end = new Date().toISOString().split('T')[0];
        const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .toISOString().split('T')[0];
        const res = await authedFetch(
          `/api/wetstock/reconciliation?siteIds=${siteIds}&startDate=${start}&endDate=${end}`
        );
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        if (cancelled) return;
        const flagged = (data?.sites || []).filter((s) =>
          (s.grades || []).some((g) => g.status === 'alert' || g.status === 'watch')
        );
        const summary = data?.summary || {};
        setCounts({
          alert: summary.alert || 0,
          watch: summary.watch || 0,
          sites: flagged,
        });
      } catch (e) {
        if (!cancelled) setCounts({ alert: 0, watch: 0, sites: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [siteIds]);

  if (loading) return null;
  const { alert, watch, sites } = counts;
  if (alert === 0 && watch === 0) return null;

  const tone = alert > 0 ? 'red' : 'amber';
  const palette = tone === 'red'
    ? 'border-red-300 bg-red-50'
    : 'border-amber-300 bg-amber-50';
  const icon = tone === 'red' ? AlertTriangle : Activity;
  const Icon = icon;
  const text = tone === 'red' ? 'text-red-800' : 'text-amber-800';
  const subText = tone === 'red' ? 'text-red-700' : 'text-amber-700';

  const previewSites = sites.slice(0, 3).map((s) => s.site_name).join(', ');
  const extra = sites.length > 3 ? ` +${sites.length - 3} more` : '';

  return (
    <Card className={`border ${palette} shadow-sm`}>
      <CardContent className="p-3 flex items-center gap-3 flex-wrap">
        <Icon className={`h-5 w-5 ${text} shrink-0`} />
        <div className="flex-1 min-w-[200px]">
          <div className={`text-sm font-semibold ${text}`}>
            {alert > 0 && `${alert} site${alert === 1 ? '' : 's'} with fuel-loss alerts`}
            {alert > 0 && watch > 0 && ' · '}
            {watch > 0 && `${watch} site${watch === 1 ? '' : 's'} on watch`}
          </div>
          <div className={`text-xs ${subText} mt-0.5 truncate`}>
            {previewSites}{extra}
          </div>
        </div>
        <Button
          size="sm"
          variant={tone === 'red' ? 'destructive' : 'default'}
          onClick={onJumpToWetstock}
          className={tone === 'amber' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
        >
          View wet-stock <ChevronRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
