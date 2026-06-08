'use client';

import { Calendar, Layers } from 'lucide-react';

/**
 * ViewToggle — Pill-style toggle between Daily Summary and Shift Details
 * views in the Owner/Operator dashboards. Extracted from /app/app/app/page.js.
 */
export default function ViewToggle({ viewType, setViewType }) {
  return (
    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
      <button
        onClick={() => setViewType('daily')}
        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
          viewType === 'daily'
            ? 'bg-white shadow-sm text-teal-600'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <Calendar className="h-4 w-4 inline mr-2" />
        Daily Summary
      </button>
      <button
        onClick={() => setViewType('shift')}
        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
          viewType === 'shift'
            ? 'bg-white shadow-sm text-teal-600'
            : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        <Layers className="h-4 w-4 inline mr-2" />
        Shift Details
      </button>
    </div>
  );
}
