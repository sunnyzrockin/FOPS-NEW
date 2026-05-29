'use client';

/**
 * @deprecated Replaced by /app/components/shared/app-shell.jsx (Section 3
 * of the May 2026 redesign). The new AppShell renders a left sidebar for
 * Owner/Operator and a 2-button top bar for Staff, with tab state driven
 * from the URL (?tab=...). Kept temporarily for reference; safe to delete
 * once we've shipped a release. Not imported anywhere in the app.
 */
import { Button } from '@/components/ui/button';
import {
  Fuel, LogOut, BarChart3, Building2, Users, Settings, Calculator,
  ClipboardList, FileText, Droplets, Map, TableProperties, TrendingUp,
} from 'lucide-react';

/**
 * Header — Top app navigation bar. Shows brand, current user, logout
 * button, and a role-dependent set of tab buttons. Pure presentational;
 * parent owns `activeTab` state. Extracted from /app/app/app/page.js as
 * Phase D of the dashboard monolith refactor.
 */
export default function Header({ user, onLogout, activeTab, setActiveTab }) {
  const tabs = user.role === 'owner'
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
        { id: 'executive', label: 'Executive', icon: TrendingUp },
        { id: 'pivot', label: 'Monthly Reports', icon: TableProperties },
        { id: 'sites', label: 'Sites', icon: Building2 },
        { id: 'operators', label: 'Operators', icon: Users },
        { id: 'submissions', label: 'Banking Submissions', icon: ClipboardList },
        { id: 'fuel-inventory', label: 'Fuel Inventory', icon: Droplets },
        { id: 'live-prices', label: 'QLD Live Prices', icon: Map },
        { id: 'fuel-prices', label: 'Fuel Prices', icon: Fuel },
      ]
    : user.role === 'operator'
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
        { id: 'pivot', label: 'Monthly Reports', icon: TableProperties },
        { id: 'staff', label: 'Staff Management', icon: Users },
        { id: 'pricing', label: 'Fuel Pricing', icon: Fuel },
        { id: 'submissions', label: 'Banking Submissions', icon: ClipboardList },
        { id: 'fuel-inventory', label: 'Fuel Inventory', icon: Droplets },
        { id: 'fields', label: 'Form Fields', icon: Settings },
        { id: 'banking', label: 'Banking', icon: Calculator },
      ]
    : [
        { id: 'submit', label: 'Submit Report', icon: ClipboardList },
        { id: 'history', label: 'My Reports', icon: FileText },
      ];

  return (
    <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
              <Fuel className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">FOPS</h1>
              <p className="text-xs text-muted-foreground capitalize">{user.role} Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Button variant="outline" size="icon" onClick={onLogout} className="rounded-xl">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex gap-1 -mb-px overflow-x-auto pb-px">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-slate-50'
                } rounded-t-lg`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
