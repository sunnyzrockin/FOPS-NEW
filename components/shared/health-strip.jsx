'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, AlertTriangle, ClipboardList, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * HealthStrip — at-a-glance operations summary rendered above the KPI
 * stat cards on the Owner and Operator dashboards (Section 5d of the
 * May 2026 redesign).
 *
 * Shows four signal "chips":
 *   1. `X/Y sites submitted today`
 *        green when all sites in, amber when partial, red when none.
 *   2. `N shifts pending review`
 *        amber chip if > 0, hidden when 0.
 *   3. `N variance alerts`
 *        red chip if > 0, hidden when 0.
 *   4. Last-updated timestamp on the right.
 *
 * @param {object} props
 * @param {object} props.stats          — payload from /api/dashboard/stats
 *        (submittedToday, totalSites, pendingReview, varianceAlerts)
 * @param {number|Date|null} props.lastLoaded — when `stats` was fetched
 *        (Date or epoch ms). Optional.
 */
export default function HealthStrip({ stats, lastLoaded = null }) {
  const submittedToday = Number(stats?.submittedToday ?? 0);
  // FEAT 1: prefer the shifts_per_day-aware totalExpectedToday from the
  // stats endpoint. Falls back to totalSites (one-shift-per-site math)
  // for older deployments / pre-migration installs.
  const totalExpected = Number(stats?.totalExpectedToday ?? stats?.totalSites ?? 0);
  const pendingReview = Number(stats?.pendingReview ?? stats?.pendingReports ?? 0);
  const varianceAlerts = Number(stats?.varianceAlerts ?? 0);

  /* Submission completeness colour --------------------------------- */
  const submissionTone = useMemo(() => {
    if (totalExpected === 0) return 'muted';
    if (submittedToday >= totalExpected) return 'green';
    if (submittedToday > 0) return 'amber';
    return 'red';
  }, [submittedToday, totalExpected]);

  const toneClasses = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    muted: 'bg-muted text-muted-foreground ring-border',
  };

  const lastLoadedLabel = useMemo(() => {
    if (!lastLoaded) return null;
    const d = lastLoaded instanceof Date ? lastLoaded : new Date(lastLoaded);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [lastLoaded]);

  return (
    <Card className="border border-border/50 shadow-sm">
      <CardContent className="p-3 flex items-center gap-2 flex-wrap">
        {/* Submission chip ----------------------------------------- */}
        <div
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1',
            toneClasses[submissionTone]
          )}
        >
          {submissionTone === 'green' ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <ClipboardList className="h-3.5 w-3.5" />
          )}
          {submittedToday}/{totalExpected} shifts submitted today
        </div>

        {/* Pending review chip ------------------------------------- */}
        {pendingReview > 0 && (
          <div
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1',
              toneClasses.amber
            )}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            {pendingReview} shift{pendingReview === 1 ? '' : 's'} pending review
          </div>
        )}

        {/* Variance alert chip ------------------------------------- */}
        {varianceAlerts > 0 && (
          <div
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1',
              toneClasses.red
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {varianceAlerts} variance alert{varianceAlerts === 1 ? '' : 's'}
          </div>
        )}

        <div className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
          {lastLoadedLabel && (
            <>
              <Clock className="h-3 w-3" />
              <span>Updated {lastLoadedLabel}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
