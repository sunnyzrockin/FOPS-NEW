'use client';

import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sunrise, Sun, Moon, CheckCircle2, Clock, AlertCircle, MapPin } from 'lucide-react';

/**
 * detectCurrentShift — returns 'Morning' | 'Afternoon' | 'Night' based
 * on the current hour. Same buckets used by the Phase-3 wiring (8/14/22).
 */
export function detectCurrentShift(now = new Date()) {
  const h = now.getHours();
  if (h >= 6 && h < 14) return 'Morning';
  if (h >= 14 && h < 22) return 'Afternoon';
  return 'Night';
}

const SHIFT_ICONS = { Morning: Sunrise, Afternoon: Sun, Night: Moon };

/**
 * TodayAtAGlance — top card on the Staff Submit Report tab. Shows the
 * staff member's current site (or all assigned sites), the auto-detected
 * shift type, and a status pill for any report they already submitted
 * today for that site/shift.
 */
export default function TodayAtAGlance({ user, sites = [], reports = [] }) {
  const today = new Date().toISOString().split('T')[0];
  const shiftType = detectCurrentShift();
  const ShiftIcon = SHIFT_ICONS[shiftType] || Sun;

  const todaysReports = useMemo(() => {
    return (reports || []).filter((r) => (r.date || '').startsWith(today));
  }, [reports, today]);

  const currentShiftReport = useMemo(() => {
    return todaysReports.find((r) => r.shift_type === shiftType) || null;
  }, [todaysReports, shiftType]);

  const statusBadge = (() => {
    if (!currentShiftReport) {
      return {
        label: 'Not submitted yet',
        cls: 'bg-amber-50 text-amber-700 ring-amber-200',
        Icon: AlertCircle,
      };
    }
    const s = currentShiftReport.status;
    if (s === 'reviewed') return { label: 'Reviewed', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: CheckCircle2 };
    if (s === 'flagged') return { label: 'Flagged', cls: 'bg-red-50 text-red-700 ring-red-200', Icon: AlertCircle };
    return { label: 'Pending review', cls: 'bg-blue-50 text-blue-700 ring-blue-200', Icon: Clock };
  })();
  const StatusIcon = statusBadge.Icon;

  const friendlyDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'short', day: 'numeric',
  });

  const siteSummary = sites.length === 1
    ? sites[0].name
    : `${sites.length} sites assigned`;

  return (
    <Card className="border border-teal-200 bg-teal-50 shadow-sm">
      <CardContent className="p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[260px]">
          <div className="h-12 w-12 rounded-xl bg-white text-teal-700 grid place-items-center shadow-sm ring-1 ring-teal-200 shrink-0">
            <ShiftIcon className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs text-teal-700 font-medium uppercase tracking-wider">
              {friendlyDate}
            </div>
            <div className="text-lg font-semibold text-teal-900">
              {shiftType} shift · {user?.name || 'Staff'}
            </div>
            <div className="text-xs text-teal-700 inline-flex items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3" /> {siteSummary}
            </div>
          </div>
        </div>
        <Badge className={`text-xs ring-1 border-0 ${statusBadge.cls} px-3 py-1.5`}>
          <StatusIcon className="h-3.5 w-3.5 mr-1.5" />
          {statusBadge.label}
        </Badge>
      </CardContent>
    </Card>
  );
}
