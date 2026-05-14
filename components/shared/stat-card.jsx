'use client';

import { Card, CardContent } from '@/components/ui/card';

/**
 * StatCard — Small gradient KPI card with title, value, optional sub-value
 * and an icon. Pure presentational. Extracted from /app/app/app/page.js.
 */
export default function StatCard({ title, value, icon: Icon, subValue, color = 'blue' }) {
  const colorClasses = {
    blue: 'from-blue-500 to-indigo-500',
    green: 'from-emerald-500 to-teal-500',
    purple: 'from-purple-500 to-pink-500',
    orange: 'from-orange-500 to-amber-500',
    red: 'from-red-500 to-rose-500',
    cyan: 'from-cyan-500 to-blue-500',
  };

  return (
    <Card className="overflow-hidden border-0 shadow-lg hover:shadow-xl transition-shadow">
      <CardContent className="p-0">
        <div className={`bg-gradient-to-br ${colorClasses[color]} p-4 text-white`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-90">{title}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
              {subValue && <p className="text-xs opacity-75 mt-1">{subValue}</p>}
            </div>
            <div className="p-2 bg-white/20 rounded-xl">
              <Icon className="h-5 w-5" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
