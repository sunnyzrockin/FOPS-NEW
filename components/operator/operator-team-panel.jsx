'use client';
/* eslint-disable react-hooks/set-state-in-effect -- async fetch in effect */

import { useEffect, useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Clock } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * OperatorTeamPanel — "My team" card on the operator dashboard.
 * Lists every staff member assigned to the operator's sites along with
 * the timestamp of their most recent shift report submission and a
 * green/amber/red activity badge derived from how long ago they last
 * submitted (green <24h, amber <7d, red 7d+ / never).
 */
export default function OperatorTeamPanel({ siteIds, reports = [] }) {
  const [staffAssignments, setStaffAssignments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/api/staff-assignments');
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        if (!cancelled) setStaffAssignments(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setStaffAssignments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [siteIds]);

  // Aggregate by staff_user_id — a single staff member may be on >1 site.
  const team = useMemo(() => {
    const lastByStaff = new Map();
    for (const r of reports || []) {
      const uid = r.submitted_by_user_id;
      if (!uid) continue;
      const ts = new Date(r.created_at || r.date || 0).getTime();
      const prev = lastByStaff.get(uid);
      if (!prev || ts > prev) lastByStaff.set(uid, ts);
    }
    const byStaff = new Map();
    for (const a of staffAssignments) {
      const staff = a.staff;
      if (!staff?.id) continue;
      const existing = byStaff.get(staff.id);
      const siteName = a.site?.name || '';
      if (existing) {
        if (!existing.siteNames.includes(siteName)) existing.siteNames.push(siteName);
      } else {
        byStaff.set(staff.id, {
          id: staff.id,
          name: staff.name || staff.email,
          email: staff.email,
          siteNames: siteName ? [siteName] : [],
          lastSubmitted: lastByStaff.get(staff.id) || null,
        });
      }
    }
    return [...byStaff.values()].sort((a, b) => {
      // Most recent submitters first; never-submitted at the end
      const av = a.lastSubmitted || 0;
      const bv = b.lastSubmitted || 0;
      return bv - av;
    });
  }, [staffAssignments, reports]);

  const fmtRelative = (ts) => {
    if (!ts) return 'No submissions yet';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
  };

  const toneOf = (ts) => {
    if (!ts) return { label: 'Inactive', cls: 'bg-red-100 text-red-700 ring-red-200' };
    const diff = Date.now() - ts;
    if (diff < 24 * 60 * 60 * 1000) return { label: 'Active', cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200' };
    if (diff < 7 * 24 * 60 * 60 * 1000) return { label: 'Recent', cls: 'bg-amber-100 text-amber-700 ring-amber-200' };
    return { label: 'Stale', cls: 'bg-red-100 text-red-700 ring-red-200' };
  };

  return (
    <Card className="border border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-teal-600" />
          My team
        </CardTitle>
        <CardDescription>
          Staff assigned to your sites and their last submission
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="py-6 text-sm text-muted-foreground text-center">Loading team…</div>
        ) : team.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground text-center">
            No staff assigned yet — add one in Staff access.
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {team.map((s) => {
              const tone = toneOf(s.lastSubmitted);
              return (
                <div
                  key={s.id}
                  className="py-3 flex items-center gap-3"
                >
                  <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-700 grid place-items-center text-xs font-semibold shrink-0">
                    {(s.name || s.email || '?').slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.siteNames.length > 0 ? s.siteNames.join(', ') : s.email}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge className={`text-[10px] ring-1 border-0 ${tone.cls}`}>
                      {tone.label}
                    </Badge>
                    <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {fmtRelative(s.lastSubmitted)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
