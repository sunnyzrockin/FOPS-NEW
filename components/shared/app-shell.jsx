'use client';
/* eslint-disable react-hooks/set-state-in-effect, no-empty -- pre-existing patterns: localStorage hydration in useEffect + empty catches */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Fuel, LogOut, BarChart3, Building2, Users, Settings,
  Calculator, ClipboardList, FileText, Droplets, Map as MapIcon,
  TrendingUp, Menu, X, PanelLeftClose, PanelLeftOpen, CreditCard, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { OnboardingModal } from '@/components/shared/onboarding-modal';
import { HelpPanel } from '@/components/shared/help-panel';
import { NotificationsPanel } from '@/components/shared/notifications-panel';

/* ---------------------------------------------------------------- */
/*  ROLE → NAV GROUP DEFINITIONS                                    */
/* ---------------------------------------------------------------- */
const OWNER_GROUPS = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
      { id: 'executive', label: 'Executive', icon: TrendingUp },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'sites', label: 'Sites', icon: Building2 },
      { id: 'operators', label: 'Operators', icon: Users },
      { id: 'submissions', label: 'Banking Submissions', icon: ClipboardList },
    ],
  },
  {
    label: 'Fuel',
    items: [
      { id: 'fuel-inventory', label: 'Fuel Inventory', icon: Droplets },
      { id: 'wetstock', label: 'Wet-stock', icon: Droplets },
      { id: 'live-prices', label: 'QLD Live Prices', icon: MapIcon },
      { id: 'fuel-prices', label: 'Fuel Prices', icon: Fuel },
    ],
  },
  {
    label: 'Account',
    items: [
      { id: 'data-integrity', label: 'Data Integrity', icon: ShieldCheck },
      { id: 'billing', label: 'Billing', icon: CreditCard },
    ],
  },
];

const OPERATOR_GROUPS = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    ],
  },
  {
    label: 'Staff',
    items: [
      { id: 'staff', label: 'Staff Management', icon: Users },
    ],
  },
  {
    label: 'Fuel',
    items: [
      { id: 'pricing', label: 'Fuel Pricing', icon: Fuel },
      { id: 'fuel-inventory', label: 'Fuel Inventory', icon: Droplets },
      { id: 'wetstock', label: 'Wet-stock', icon: Droplets },
      { id: 'fuel-margin', label: 'Fuel Margin', icon: TrendingUp },
    ],
  },
  {
    label: 'Finance',
    items: [
      { id: 'banking', label: 'Banking', icon: Calculator },
      { id: 'submissions', label: 'Banking Submissions', icon: ClipboardList },
    ],
  },
  {
    label: 'Config',
    items: [
      { id: 'fields', label: 'Form Fields', icon: Settings },
    ],
  },
];

// Staff role keeps the simple 2-button top bar (no sidebar). The list is
// rendered inline by `StaffTopNav` below.
const STAFF_ITEMS = [
  { id: 'submit', label: 'Submit Report', icon: ClipboardList },
  { id: 'history', label: 'My Reports', icon: FileText },
];

const DEFAULT_TAB_BY_ROLE = {
  owner: 'dashboard',
  operator: 'dashboard',
  staff: 'submit',
};

const LS_COLLAPSED_KEY = 'fops_sidebar_collapsed';

/* ---------------------------------------------------------------- */
/*  TOP BAR                                                         */
/*  56px tall. Logo + user name + logout. NO tabs.                  */
/* ---------------------------------------------------------------- */
function TopBar({ user, onLogout, onToggleMobileSidebar, showMobileToggle }) {
  return (
    <header className="h-14 border-b bg-background flex items-center px-4 sticky top-0 z-40">
      {showMobileToggle && (
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="md:hidden mr-2 p-2 rounded hover:bg-muted"
          aria-label="Toggle navigation"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-teal-600 rounded-md flex items-center justify-center">
          <Fuel className="w-4 h-4 text-white" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-semibold text-sm">FOPS</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide capitalize">
            {user.role}
          </span>
        </div>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Notifications bell — Phase 2 Section E. Lives at the shell
            level so every authed page gets it. */}
        <NotificationsPanel user={user} />
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium leading-tight">{user.name}</p>
          <p className="text-xs text-muted-foreground leading-tight">{user.email}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onLogout}
          className="h-9 gap-2"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </Button>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- */
/*  STAFF — keep the simple 2-button top bar (no sidebar).         */
/* ---------------------------------------------------------------- */
function StaffTopNav({ activeTab, onChangeTab }) {
  return (
    <nav className="border-b bg-background sticky top-14 z-30">
      <div className="container mx-auto px-4 flex gap-2 py-2">
        {STAFF_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTab(item.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-teal-600 text-white'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ---------------------------------------------------------------- */
/*  SIDEBAR                                                         */
/* ---------------------------------------------------------------- */
function Sidebar({
  groups,
  activeTab,
  onChangeTab,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
}) {
  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onCloseMobile}
          className="md:hidden fixed inset-0 top-14 bg-black/40 z-30"
        />
      )}

      <aside
        className={cn(
          'border-r bg-background flex flex-col transition-[width] duration-150',
          // Mobile: slide-in overlay
          'fixed md:sticky top-14 bottom-0 z-30',
          'md:h-[calc(100vh-3.5rem)]',
          // Width: collapsed = 48px, expanded = 240px
          collapsed ? 'w-12' : 'w-60',
          // Mobile: hidden until mobileOpen
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Collapse / expand control */}
        <div className="h-10 flex items-center justify-end px-1 border-b shrink-0">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden md:flex p-1.5 rounded hover:bg-muted text-muted-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
          {/* Mobile close button */}
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="md:hidden p-1.5 rounded hover:bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {groups.map((group, gi) => (
            <div key={group.label} className={cn(gi > 0 && 'mt-3')}>
              {!collapsed && (
                <div className="px-3 pb-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {group.label}
                </div>
              )}
              {collapsed && gi > 0 && (
                <div className="mx-2 my-2 h-px bg-border" aria-hidden="true" />
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChangeTab(item.id);
                          onCloseMobile();
                        }}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'w-full flex items-center gap-2.5 text-sm font-medium rounded-md transition-colors',
                          collapsed ? 'mx-1 px-2 py-2 justify-center' : 'mx-2 px-2.5 py-2',
                          isActive
                            ? 'bg-teal-600 text-white hover:bg-teal-600'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

/* ---------------------------------------------------------------- */
/*  MAIN COMPONENT                                                  */
/* ---------------------------------------------------------------- */
export default function AppShell({ user, onLogout, onboardingComplete, children }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Role-scoped groups
  const groups = useMemo(() => {
    if (user.role === 'owner') return OWNER_GROUPS;
    if (user.role === 'operator') return OPERATOR_GROUPS;
    return null; // staff
  }, [user.role]);

  // Resolve active tab from URL ?tab= with role-aware default
  const activeTab =
    searchParams.get('tab') || DEFAULT_TAB_BY_ROLE[user.role] || 'dashboard';

  const changeTab = useCallback(
    (tabId) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set('tab', tabId);
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  /* -------- sidebar collapsed state (localStorage) -------- */
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // On mount: read localStorage + initialize per viewport
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_COLLAPSED_KEY);
      if (stored != null) {
        setCollapsed(stored === 'true');
      } else if (typeof window !== 'undefined' && window.innerWidth < 768) {
        // On mobile, default to collapsed (overlay)
        setCollapsed(true);
      }
    } catch {}
    setHydrated(true);
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LS_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  /* -------- first-login onboarding modal -------- */
  // Open the modal whenever the user record carries first_login === true.
  // We keep an independent piece of local state so the user can dismiss the
  // modal without us having to mutate the parent's user object — the modal
  // itself PATCHes /api/users/me on completion to persist the flip-off.
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (user?.first_login === true) {
      setShowOnboarding(true);
    }
  }, [user?.first_login]);

  const onboardingNode = (
    <OnboardingModal
      open={showOnboarding}
      onClose={() => {
        setShowOnboarding(false);
        // Tell the parent so it can update its own user state + localStorage.
        // Without this the modal would re-trigger on the next render (or a
        // soft reload) because the in-memory user.first_login is still true.
        onboardingComplete?.();
      }}
      user={user}
    />
  );

  // The Help panel (Section D) lives at the shell level so it's available
  // on every authed route. It's self-contained (manages its own open state)
  // so we just drop it in once and forget about it.
  const helpNode = <HelpPanel user={user} />;

  /* -------- staff branch: no sidebar -------- */
  if (user.role === 'staff') {
    return (
      <div className="min-h-screen bg-muted/30">
        <TopBar user={user} onLogout={onLogout} showMobileToggle={false} />
        <StaffTopNav activeTab={activeTab} onChangeTab={changeTab} />
        <main className="container mx-auto">
          {/* Pass the resolved activeTab down via cloning so legacy
              dashboard components still receive their `activeTab` prop
              unchanged. */}
          {children && typeof children === 'function'
            ? children({ activeTab })
            : children}
        </main>
        {onboardingNode}
        {helpNode}
      </div>
    );
  }

  /* -------- owner / operator branch: sidebar layout -------- */
  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <TopBar
        user={user}
        onLogout={onLogout}
        showMobileToggle={true}
        onToggleMobileSidebar={() => setMobileOpen((p) => !p)}
      />
      <div className="flex flex-1 min-h-0">
        {hydrated && groups && (
          <Sidebar
            groups={groups}
            activeTab={activeTab}
            onChangeTab={changeTab}
            collapsed={collapsed}
            onToggleCollapse={toggleCollapse}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
          />
        )}
        <main className="flex-1 min-w-0 bg-background md:bg-muted/30">
          {children && typeof children === 'function'
            ? children({ activeTab })
            : children}
        </main>
      </div>
      {onboardingNode}
      {helpNode}
    </div>
  );
}
