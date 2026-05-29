'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock } from 'lucide-react';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';

/**
 * ReportDetail — Full-detail card for a single shift report shown to the
 * operator/owner when reviewing. Includes top-line revenue, banking, and
 * grid of all field values plus an optional "Mark as Reviewed" CTA.
 * Extracted from /app/app/app/page.js.
 */
export default function ReportDetail({ report, onClose, onStatusChange, canChangeStatus, user }) {
  if (!report) return null;

  const fields = [
    { label: 'Total Sales', value: formatCurrency(report.total_sales) },
    { label: 'Fuel Sales', value: formatCurrency(report.fuel_sales) },
    { label: 'Shop Sales', value: formatCurrency(report.shop_sales) },
    { label: 'Total Litres', value: `${(report.total_litres || 0).toLocaleString()} L` },
    { label: 'EFTPOS', value: formatCurrency(report.eftpos) },
    { label: 'Motorpass', value: formatCurrency(report.motorpass) },
    { label: 'Cash', value: formatCurrency(report.cash) },
    { label: 'Accounts', value: formatCurrency(report.accounts) },
    { label: 'Beverages', value: formatCurrency(report.beverages) },
    { label: 'Hot Food', value: formatCurrency(report.hot_food) },
    { label: 'Drive Offs', value: formatCurrency(report.drive_offs) },
    { label: 'Dips', value: formatCurrency(report.dips) },
  ];

  return (
    <Card className="border border-border/50 shadow-sm">
      <CardHeader className="pb-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">{report.site_name}</CardTitle>
            <CardDescription>{report.site_code}</CardDescription>
          </div>
          <Badge
            variant={report.status === 'reviewed' ? 'default' : 'secondary'}
            className={`text-sm ${report.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}
          >
            {report.status === 'reviewed'
              ? <CheckCircle className="h-3 w-3 mr-1" />
              : <Clock className="h-3 w-3 mr-1" />}
            {report.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-xl">
          <div>
            <p className="text-xs text-muted-foreground">Date</p>
            <p className="font-medium">{formatDate(report.date)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Shift</p>
            <p className="font-medium">{report.shift_type}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Submitted By</p>
            <p className="font-medium">{report.staff_name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Submitted At</p>
            <p className="font-medium">{formatDateTime(report.submitted_at)}</p>
          </div>
        </div>

        <div className="p-5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl text-white">
          <p className="text-sm opacity-90 mb-1">Total Revenue</p>
          <p className="text-3xl font-bold">{formatCurrency(report.total_revenue)}</p>
        </div>

        {report.banking_value !== undefined && report.banking_value !== 0 && (
          <div className="p-5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white">
            <p className="text-sm opacity-90 mb-1">Banking Total</p>
            <p className="text-3xl font-bold">{formatCurrency(report.banking_value)}</p>
          </div>
        )}

        <div className="p-4 bg-orange-50 rounded-xl border border-orange-200">
          <p className="text-sm font-medium text-orange-700 mb-1">Difference / Variance</p>
          <p className="text-lg font-medium text-orange-600">
            {report.difference_value !== null ? formatCurrency(report.difference_value) : 'Formula pending'}
          </p>
          <p className="text-xs text-orange-500 mt-1">This field will be calculated once formula is provided</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {fields.map((field, i) => (
            <div key={i} className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-muted-foreground">{field.label}</p>
              <p className="font-semibold">{field.value}</p>
            </div>
          ))}
        </div>

        {report.notes && (
          <div className="p-4 bg-slate-50 rounded-xl">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{report.notes}</p>
          </div>
        )}

        {report.status === 'reviewed' && report.reviewed_by_name && (
          <div className="p-4 bg-green-50 rounded-xl border border-green-200">
            <p className="text-xs text-green-700 mb-1">Reviewed By</p>
            <p className="font-medium text-green-800">{report.reviewed_by_name}</p>
            <p className="text-xs text-green-600">{formatDateTime(report.reviewed_at)}</p>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
          {canChangeStatus && report.status === 'pending' && (
            <Button
              onClick={() => onStatusChange(report.id, 'reviewed', user.id)}
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500"
            >
              <CheckCircle className="h-4 w-4 mr-2" /> Mark as Reviewed
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
