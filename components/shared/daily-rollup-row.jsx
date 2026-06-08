'use client';

import { Badge } from '@/components/ui/badge';
import { Calendar, ChevronUp, ChevronDown, ChevronRight, Calculator } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/format';

/**
 * DailyRollupRow — Expandable per-site, per-day rollup row showing top-line
 * revenue, pending/reviewed badges, a breakdown grid, optional formula
 * rollups, and the list of individual shifts. Pure presentational.
 * Extracted from /app/app/app/page.js.
 */
export default function DailyRollupRow({ rollup, onClick, expanded, onToggle }) {
  return (
    <div className="border rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-teal-100 to-indigo-100 rounded-xl flex items-center justify-center">
            <Calendar className="h-6 w-6 text-teal-600" />
          </div>
          <div>
            <p className="font-semibold text-lg">{rollup.site_name}</p>
            <p className="text-sm text-muted-foreground">
              {formatDate(rollup.date)} • {rollup.shift_count} shift{rollup.shift_count > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xl font-bold text-teal-600">{formatCurrency(rollup.total_revenue)}</p>
            <p className="text-xs text-muted-foreground">Total Revenue</p>
          </div>
          <div className="flex items-center gap-2">
            {rollup.pending_count > 0 && (
              <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                {rollup.pending_count} pending
              </Badge>
            )}
            {rollup.reviewed_count > 0 && (
              <Badge className="bg-green-100 text-green-700">{rollup.reviewed_count} reviewed</Badge>
            )}
          </div>
          {expanded
            ? <ChevronUp className="h-5 w-5 text-slate-400" />
            : <ChevronDown className="h-5 w-5 text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-slate-50 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
            <div className="bg-white p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">Fuel Sales</p>
              <p className="font-semibold">{formatCurrency(rollup.fuel_sales)}</p>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">Shop Sales</p>
              <p className="font-semibold">{formatCurrency(rollup.shop_sales)}</p>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">EFTPOS</p>
              <p className="font-semibold">{formatCurrency(rollup.eftpos)}</p>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">Cash</p>
              <p className="font-semibold">{formatCurrency(rollup.cash)}</p>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">Dips</p>
              <p className="font-semibold">{formatCurrency(rollup.dips)}</p>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <p className="text-xs text-muted-foreground">Banking</p>
              <p className="font-semibold text-purple-600">{formatCurrency(rollup.banking_value)}</p>
            </div>
          </div>

          {rollup.formula_results && rollup.formula_results.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <Calculator className="h-4 w-4 text-teal-600" />
                <p className="text-sm font-medium">Daily Formula Rollups</p>
                <Badge variant="outline" className="text-xs">Auto-calculated</Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(rollup.formula_results || []).map((result, idx) => (
                  <div
                    key={idx}
                    className="bg-gradient-to-br from-teal-50 to-indigo-50 border border-teal-200 p-3 rounded-lg"
                  >
                    <p className="text-xs text-teal-600 mb-1">{result.formula_name}</p>
                    <p className="text-lg font-bold text-teal-700">{formatCurrency(result.result_value)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{result.result_label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-sm font-medium mb-2">Individual Shifts:</p>
          <div className="space-y-2">
            {(rollup.shifts || []).map((shift) => (
              <div
                key={shift.id}
                className="flex items-center justify-between p-3 bg-white rounded-lg cursor-pointer hover:bg-teal-50 transition-colors"
                onClick={(e) => { e.stopPropagation(); onClick(shift.id); }}
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{shift.shift_type}</Badge>
                  <span className="text-sm">{formatCurrency(shift.total_revenue)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={shift.status === 'reviewed' ? 'default' : 'secondary'}
                    className={shift.status === 'reviewed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}
                  >
                    {shift.status}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
