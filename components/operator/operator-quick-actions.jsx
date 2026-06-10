'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Droplet, Banknote, Receipt, Users, Fuel } from 'lucide-react';

/**
 * OperatorQuickActions — single horizontal strip of common actions that
 * operators reach for daily. Each button delegates to the parent's tab
 * setter so URL-routing in AppShell continues to work.
 */
export default function OperatorQuickActions({ onAction }) {
  const actions = [
    {
      key: 'fuel-inventory',
      label: 'Record fuel delivery',
      hint: 'Log dip + cost',
      icon: Fuel,
      tone: 'teal',
    },
    {
      key: 'fuel-inventory',
      label: 'Submit dip reading',
      hint: 'Tank levels',
      icon: Droplet,
      tone: 'cyan',
    },
    {
      key: 'submissions',
      label: 'Banking submissions',
      hint: 'Review staff banking',
      icon: Receipt,
      tone: 'emerald',
    },
    {
      key: 'banking',
      label: 'Banking formulas',
      hint: 'Manage formulas',
      icon: Banknote,
      tone: 'indigo',
    },
    {
      key: 'staff',
      label: 'Staff access',
      hint: 'Manage team',
      icon: Users,
      tone: 'slate',
    },
  ];

  const toneClasses = {
    teal: 'bg-teal-50 text-teal-700 ring-teal-200 hover:bg-teal-100',
    cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-200 hover:bg-cyan-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200 hover:bg-indigo-100',
    slate: 'bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100',
  };

  return (
    <Card className="border border-border/50 shadow-sm">
      <CardContent className="p-3 flex items-center gap-2 flex-wrap">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-2 shrink-0">
          Quick actions
        </div>
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={`${a.key}-${a.label}`}
              type="button"
              onClick={() => onAction?.(a.key)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium ring-1 transition-colors ${toneClasses[a.tone]}`}
            >
              <Icon className="h-4 w-4" />
              <span className="flex flex-col items-start leading-tight">
                <span>{a.label}</span>
                <span className="text-[10px] opacity-70">{a.hint}</span>
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
