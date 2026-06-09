'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Download, Loader2 } from 'lucide-react';

import { toast } from 'sonner';
import { authedFetch } from '@/lib/authed-fetch';
import {
  createFopsPdf, addSectionTitle, addTable, saveFopsPdf,
} from '@/lib/pdf-export';

/**
 * ExportDialog — Modal launched from a toolbar button to download shift
 * data as XLSX or PDF for a date range. Calls /api/export with the
 * appropriate query params.
 *
 * - XLSX comes pre-built from the server (server returns the binary).
 * - PDF is generated CLIENT-SIDE via lib/pdf-export.js using the JSON
 *   variant of the same /api/export endpoint.
 *
 * Filenames follow the FOPS convention:
 *   FOPS_<ViewType>_<from>_to_<to>.<ext>
 *   e.g. FOPS_DailySummary_2026-06-02_to_2026-06-09.xlsx
 *
 * If `role === 'owner'` the dialog locks View Type to Daily Summary so
 * the owner export matches their on-screen experience.
 */
export default function ExportDialog({ siteIds, role }) {
  const isOwner = role === 'owner';
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState('xlsx');
  const [viewType, setViewType] = useState('daily');
  const [dateRange, setDateRange] = useState(() => ({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  }));
  const [exporting, setExporting] = useState(false);

  const effectiveViewType = isOwner ? 'daily' : viewType;

  const buildFilename = (ext) => {
    const label = effectiveViewType === 'daily' ? 'DailySummary' : 'ShiftReports';
    return `FOPS_${label}_${dateRange.start}_to_${dateRange.end}.${ext}`;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const base = `/api/export?viewType=${effectiveViewType}&siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`;

      if (format === 'xlsx') {
        const res = await authedFetch(`${base}&format=xlsx`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = buildFilename('xlsx');
        link.click();
      } else if (format === 'pdf') {
        // Pull raw rows as JSON and render via the shared FOPS PDF builder.
        const res = await authedFetch(`${base}&format=json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rows = Array.isArray(data?.rows) ? data.rows : [];

        const titleLabel = effectiveViewType === 'daily'
          ? 'Daily Summary Export'
          : 'Shift Reports Export';
        const doc = createFopsPdf({
          title: 'FOPS Report',
          subtitle: titleLabel,
          dateRange: { from: dateRange.start, to: dateRange.end },
          orientation: 'landscape',
        });
        addSectionTitle(doc, `${titleLabel} · ${rows.length} row${rows.length === 1 ? '' : 's'}`);

        if (rows.length === 0) {
          addTable(doc, [['Notice']], [['No reports found for the selected range.']]);
        } else {
          const headers = Object.keys(rows[0]);
          const body = rows.map((r) =>
            headers.map((h) => (r[h] == null ? '' : String(r[h])))
          );
          addTable(doc, [headers], body);
        }
        saveFopsPdf(doc, buildFilename('pdf'));
      }
      setOpen(false);
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Download className="h-4 w-4 mr-2" /> Export</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Reports</DialogTitle>
          <DialogDescription>
            Download report data for the selected date range. Filenames follow the FOPS_&lt;View&gt;_&lt;from&gt;_to_&lt;to&gt;.&lt;ext&gt; convention.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>From</Label>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>To</Label>
              <Input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                className="mt-1"
              />
            </div>
          </div>
          {!isOwner && (
            <div>
              <Label>View Type</Label>
              <Select value={viewType} onValueChange={setViewType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily Summary</SelectItem>
                  <SelectItem value="shift">Shift Details</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {isOwner && (
            <p className="text-xs text-muted-foreground">
              Owner export is locked to <span className="font-medium">Daily Summary</span>.
            </p>
          )}
          <div>
            <Label>Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                <SelectItem value="pdf">PDF (.pdf)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button
            onClick={handleExport}
            disabled={exporting}
            className="bg-teal-600 text-white hover:bg-teal-700"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
