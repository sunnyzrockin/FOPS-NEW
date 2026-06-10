'use client';

import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * StatCard — Flat Xero-style KPI card.
 *
 * Visual spec (May 2026 redesign, Section 4a):
 *   - White (bg-card) background, NO gradient
 *   - 3px left border accent in the colour passed via `color`
 *   - 11px uppercase muted label → 24px/500 value → optional trend line
 *   - `shadow-sm` only (no shadow-lg)
 *
 * The props (title, value, subValue, color, icon) are kept fully
 * backward-compatible with the 16 existing call sites — only the visual
 * treatment changes.
 *
 * NEW optional prop `trend`: `{ value: number, direction: 'up' | 'down' }`
 *   - direction 'up'   → green text + TrendingUp icon
 *   - direction 'down' → red text   + TrendingDown icon
 *   - value renders as `{value}%` (caller pre-formats if not a %)
 *
 * @param {object} props
 * @param {string} props.title
 * @param {string|number} props.value
 * @param {React.ComponentType<{className?: string}>} [props.icon]
 * @param {string} [props.subValue]
 * @param {'blue'|'green'|'amber'|'red'|'purple'|'orange'|'cyan'} [props.color]
 * @param {{value: number, direction: 'up'|'down'}} [props.trend]
 */
export default function StatCard({
  title,
  value,
  icon: Icon,
  subValue,
  color = 'blue',
  trend,
}) {
  // ----- Colour token map ------------------------------------------------
  // Each entry covers the left accent stripe + the icon tint.
  // We use Tailwind colour utility classes resolved via the design tokens
  // so dark mode "just works".
  const accentMap = {
    blue: { border: 'border-l-teal-500', iconBg: 'bg-teal-50', iconText: 'text-teal-600' },
    teal: { border: 'border-l-teal-500', iconBg: 'bg-teal-50', iconText: 'text-teal-600' },
    green: { border: 'border-l-emerald-500', iconBg: 'bg-emerald-50', iconText: 'text-emerald-600' },
    amber: { border: 'border-l-amber-500', iconBg: 'bg-amber-50', iconText: 'text-amber-600' },
    red: { border: 'border-l-red-500', iconBg: 'bg-red-50', iconText: 'text-red-600' },
    purple: { border: 'border-l-purple-500', iconBg: 'bg-purple-50', iconText: 'text-purple-600' },
    orange: { border: 'border-l-orange-500', iconBg: 'bg-orange-50', iconText: 'text-orange-600' },
    cyan: { border: 'border-l-cyan-500', iconBg: 'bg-cyan-50', iconText: 'text-cyan-600' },
  };
  const c = accentMap[color] || accentMap.blue;

  const TrendIcon = trend?.direction === 'down' ? TrendingDown : TrendingUp;
  const trendColour =
    trend?.direction === 'down' ? 'text-red-600' : 'text-emerald-600';

  return (
    <Card
      className={cn(
        'bg-card border border-border/50 shadow-sm',
        'border-l-[3px]',
        c.border
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
              {title}
            </p>
            <p className="text-2xl font-medium text-foreground mt-1 tabular-nums">
              {value}
            </p>
            {(subValue || trend) && (
              <div className="mt-1 flex items-center gap-2 text-xs">
                {trend && (
                  <span className={cn('inline-flex items-center gap-0.5 font-medium', trendColour)}>
                    <TrendIcon className="h-3 w-3" />
                    {Math.abs(trend.value)}%
                  </span>
                )}
                {subValue && (
                  <span className="text-muted-foreground truncate">{subValue}</span>
                )}
              </div>
            )}
          </div>
          {Icon && (
            <div className={cn('p-2 rounded-md shrink-0', c.iconBg)}>
              <Icon className={cn('h-4 w-4', c.iconText)} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
