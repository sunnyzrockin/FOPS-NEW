'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, AlertCircle, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

const STATUS_TONES = {
  reviewed: { label: 'Reviewed', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', Icon: CheckCircle2 },
  pending:  { label: 'Pending',  cls: 'bg-blue-50 text-blue-700 ring-blue-200',         Icon: Clock },
  flagged:  { label: 'Flagged',  cls: 'bg-red-50 text-red-700 ring-red-200',            Icon: AlertCircle },
};

function StatusPill({ status }) {
  const tone = STATUS_TONES[status] || STATUS_TONES.pending;
  const Icon = tone.Icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${tone.cls}`}>
      <Icon className="h-3 w-3" /> {tone.label}
    </span>
  );
}

/**
 * RecentReportsPanel — compact list of the staff's recent reports with
 * a status pill, shift type, site, and tap-to-view affordance. Used on
 * the Submit tab (above the form) and also re-usable on the My Reports
 * tab if desired.
 */
export default function RecentReportsPanel({ reports = [], sites = [], onSelect, limit = 5 }) {
  const sitesById = new Map((sites || []).map((s) => [s.id, s]));
  const head = (reports || []).slice(0, limit);

  if (head.length === 0) {
    return (
      <Card className="border border-border/50 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">My recent reports</CardTitle>
          <CardDescription>Reports you have submitted will appear here</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground py-4 text-center">
            No reports yet — submit your first one using the form below.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/50 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">My recent reports</CardTitle>
        <CardDescription>
          Your last {head.length} shift report{head.length === 1 ? '' : 's'} — tap to view
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border/60">
          {head.map((r) => {
            const site = sitesById.get(r.site_id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect?.(r)}
                className="w-full text-left py-2.5 flex items-center gap-3 hover:bg-muted/40 -mx-2 px-2 rounded-md transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {r.shift_type} · {site?.name || r.site_id}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.date} · Total {formatCurrency(r.total_revenue ?? r.total_sales ?? 0)}
                  </div>
                </div>
                <StatusPill status={r.status || 'pending'} />
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
