'use client';
/* eslint-disable react-hooks/set-state-in-effect, no-empty -- pre-existing pattern in dashboards */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Smartphone, FileSpreadsheet } from 'lucide-react';

import ReportRow from '@/components/shared/report-row';
import ReportDetail from '@/components/shared/report-detail';
import ShiftReportForm from '@/components/staff/shift-report-form';
import ShiftReportWizard from '@/components/staff/shift-report-wizard';
import StaffPriceChangeBanner from '@/components/staff/staff-price-change-banner';
import TodayAtAGlance from '@/components/staff/today-at-a-glance';
import RecentReportsPanel from '@/components/staff/recent-reports-panel';
import { authedFetch } from '@/lib/authed-fetch';

const FORM_MODE_KEY = 'fops_staff_form_mode';

/**
 * StaffDashboard — Staff-facing dashboard. Sections:
 *   1. Pinned fuel-price change banner.
 *   2. "Today at a glance" card (auto-detected shift + status).
 *   3. Recent reports panel (status pills, tap-to-view).
 *   4. The shift report form (Classic or Wizard mode toggle in header).
 *   5. My Submitted Reports tab — full history list.
 *
 * Mobile-first wizard is now the default when there's no saved preference;
 * desktop visitors get Classic by default. Either way the choice is
 * persisted to localStorage and respected on subsequent visits.
 */
export default function StaffDashboard({ user, sites, activeTab }) {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  // Default mode is determined by:
  //   1. localStorage preference (returning users — never overridden)
  //   2. New default: wizard for everyone (mobile-first). Desktop users
  //      can switch to Classic via the header toggle, persisting their
  //      preference.
  const [formMode, setFormMode] = useState('wizard');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FORM_MODE_KEY);
      if (saved === 'wizard' || saved === 'classic') {
        setFormMode(saved);
        return;
      }
    } catch {}
    // No saved preference — mobile-first wizard for everyone.
    setFormMode('wizard');
  }, []);

  const switchMode = (mode) => {
    setFormMode(mode);
    try { localStorage.setItem(FORM_MODE_KEY, mode); } catch {}
  };

  const loadReports = useCallback(async () => {
    try {
      const res = await authedFetch('/api/reports');
      const data = await res.json();
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleReportClick = async (report) => {
    const res = await authedFetch(`/api/reports/${report.id}`);
    const data = await res.json();
    setSelectedReport(data);
  };

  if (selectedReport) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <ReportDetail
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          canChangeStatus={false}
          user={user}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-4">
      <StaffPriceChangeBanner user={user} />

      {activeTab === 'submit' && (
        <>
          {/* Today-at-a-glance — site, shift, today's submission status. */}
          <TodayAtAGlance user={user} sites={sites} reports={reports} />

          {/* Recent reports — only show after some history exists. */}
          {!loading && reports.length > 0 && (
            <RecentReportsPanel
              reports={reports}
              sites={sites}
              onSelect={handleReportClick}
              limit={3}
            />
          )}

          {(() => {
            // Build the Classic ↔ Wizard toggle once and render it inside the
            // form card header (more discoverable than floating above the card).
            const ModeToggle = (
              <div className="inline-flex rounded-md border bg-background shadow-sm shrink-0">
                <button
                  type="button"
                  onClick={() => switchMode('classic')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-l-md transition-colors ${
                    formMode === 'classic'
                      ? 'bg-teal-600 text-white'
                      : 'bg-transparent text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Classic
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('wizard')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-r-md transition-colors ${
                    formMode === 'wizard'
                      ? 'bg-teal-600 text-white'
                      : 'bg-transparent text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" /> Wizard
                </button>
              </div>
            );
            return formMode === 'wizard' ? (
              <ShiftReportWizard
                user={user}
                sites={sites}
                onSuccess={loadReports}
                onSwitchToClassic={() => switchMode('classic')}
                modeToggle={ModeToggle}
              />
            ) : (
              <ShiftReportForm
                user={user}
                sites={sites}
                onSuccess={loadReports}
                modeToggle={ModeToggle}
              />
            );
          })()}
        </>
      )}

      {activeTab === 'history' && (
        <Card className="border border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle>My Submitted Reports</CardTitle>
            <CardDescription>View your recent shift report submissions</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
              </div>
            ) : reports.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No reports submitted yet</p>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {reports.map((report) => (
                    <ReportRow
                      key={report.id}
                      report={report}
                      onClick={() => handleReportClick(report)}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
