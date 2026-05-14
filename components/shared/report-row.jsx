'use client';

import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle, Clock, ChevronRight } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/format';

/**
 * ReportRow — Compact single-shift report row used in "My Reports" and
 * operator lists. Pure presentational. Extracted from /app/app/app/page.js.
 */
export default function ReportRow({ report, onClick }) {
  return (
    <div
      className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border"
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
          <FileText className="h-5 w-5 text-slate-500" />
        </div>
        <div>
          <p className="font-medium">{report.site_name}</p>
          <p className="text-sm text-muted-foreground">
            {formatDate(report.date)} • {report.shift_type} Shift
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="font-semibold">{formatCurrency(report.total_revenue)}</p>
          <p className="text-xs text-muted-foreground">{report.staff_name}</p>
        </div>
        <Badge
          variant={report.status === 'reviewed' ? 'default' : 'secondary'}
          className={report.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}
        >
          {report.status === 'reviewed'
            ? <CheckCircle className="h-3 w-3 mr-1" />
            : <Clock className="h-3 w-3 mr-1" />}
          {report.status}
        </Badge>
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </div>
    </div>
  );
}
