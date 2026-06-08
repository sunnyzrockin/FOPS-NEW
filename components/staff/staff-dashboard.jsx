'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Loader2, Smartphone, FileSpreadsheet } from 'lucide-react';

import ReportRow from '@/components/shared/report-row';
import ReportDetail from '@/components/shared/report-detail';
import ShiftReportForm from '@/components/staff/shift-report-form';
import ShiftReportWizard from '@/components/staff/shift-report-wizard';
import StaffPriceChangeBanner from '@/components/staff/staff-price-change-banner';
import { authedFetch } from '@/lib/authed-fetch';

const FORM_MODE_KEY = 'fops_staff_form_mode';

/**
 * StaffDashboard — Staff-facing dashboard. Shows a pinned fuel-price
 * change banner and the shift report submission form (with a Classic /
 * Wizard mode toggle), plus a paginated list of previously submitted
 * reports.
 */
export default function StaffDashboard({ user, sites, activeTab }) {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  // Default mode is determined by:
  //   1. localStorage preference (returning users — never overridden)
  //   2. Viewport size on first visit: <768px → 'wizard' (mobile-first),
  //      otherwise 'classic'
  const [formMode, setFormMode] = useState('classic');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(FORM_MODE_KEY);
      if (saved === 'wizard' || saved === 'classic') {
        setFormMode(saved);
        return;
      }
    } catch {}
    // No saved preference — pick a default based on viewport.
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setFormMode('wizard');
    } else {
      setFormMode('classic');
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="container mx-auto px-4 py-6">
      <StaffPriceChangeBanner user={user} />

      {activeTab === 'submit' && (() => {
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
