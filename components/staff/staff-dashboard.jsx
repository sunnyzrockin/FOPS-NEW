'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';

import ReportRow from '@/components/shared/report-row';
import ReportDetail from '@/components/shared/report-detail';
import ShiftReportForm from '@/components/staff/shift-report-form';
import StaffPriceChangeBanner from '@/components/staff/staff-price-change-banner';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * StaffDashboard — Staff-facing dashboard. Shows a pinned fuel-price
 * change banner, the shift report submission form, and a paginated list
 * of the staff member's previously submitted reports. Routes between
 * Submit and History views based on parent activeTab. Extracted from
 * /app/app/app/page.js (Phase D Batch 2c).
 */
export default function StaffDashboard({ user, sites, activeTab }) {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    try {
      // Staff view: backend derives scope from the JWT (returns only this
      // user's submitted reports). No need to send userId in the query.
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
    const res = await fetch(`/api/reports/${report.id}`);
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

      {activeTab === 'submit' && <ShiftReportForm user={user} sites={sites} onSuccess={loadReports} />}
      {activeTab === 'history' && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle>My Submitted Reports</CardTitle>
            <CardDescription>View your recent shift report submissions</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
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
