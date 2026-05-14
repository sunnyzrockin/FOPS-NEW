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

/**
 * ExportDialog — Modal launched from a toolbar button to download shift
 * data as XLSX or JSON for a date range. Calls /api/export with the
 * appropriate query params and triggers a browser download.
 * Extracted from /app/app/app/page.js.
 */
export default function ExportDialog({ siteIds }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState('xlsx');
  const [viewType, setViewType] = useState('daily');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const url = `/api/export?format=${format}&viewType=${viewType}&siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`;

      if (format === 'xlsx') {
        const res = await fetch(url);
        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `workflowlite_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        link.click();
      } else {
        const res = await fetch(url);
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `workflowlite_export_${new Date().toISOString().split('T')[0]}.json`;
        link.click();
      }
      setOpen(false);
    } catch (err) {
      alert('Export failed: ' + err.message);
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
          <DialogDescription>Download report data for the selected date range</DialogDescription>
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
          <div>
            <Label>Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button
            onClick={handleExport}
            disabled={exporting}
            className="bg-gradient-to-r from-blue-500 to-indigo-600"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
