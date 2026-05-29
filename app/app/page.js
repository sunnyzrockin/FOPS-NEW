'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// All UI lives in /app/components/* now. This file is the slim role-router.
import AppShell from '@/components/shared/app-shell';
import OwnerDashboard from '@/components/owner/owner-dashboard';
import OperatorDashboard from '@/components/operator/operator-dashboard';
import StaffDashboard from '@/components/staff/staff-dashboard';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * /app — the protected dashboard. This component is intentionally thin:
 *   1) On mount, hydrate user/sites from localStorage; if missing, bounce
 *      to /login.
 *   2) Wire a 5-min global escalation poller while the user is logged in.
 *   3) Render the AppShell + the role-specific dashboard, with tab state
 *      driven from the URL (?tab=...) for bookmarkability.
 *
 * Everything else (forms, fuel pricing, banking, staff/operator/site
 * management, charts, KPI cards, etc.) lives in the dedicated component
 * tree under /app/components/. See ARCHITECTURE.md.
 */
function AppInner() {
  const router = useRouter();

  // Start with null to avoid hydration mismatch
  const [user, setUser] = useState(null);
  const [sites, setSites] = useState([]);
  const [mounted, setMounted] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);

  // Initialize from localStorage only on client side (runs once on mount)
  useEffect(() => {
    const savedUser = localStorage.getItem('workflowlite_user');
    const savedSites = localStorage.getItem('workflowlite_sites');

    if (savedUser && savedSites) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setSites(JSON.parse(savedSites));
        setMounted(true);
      } catch (e) {
        console.error('Failed to parse user data:', e);
        localStorage.removeItem('workflowlite_user');
        localStorage.removeItem('workflowlite_sites');
        if (!hasRedirected) {
          setHasRedirected(true);
          router.replace('/login');
        }
      }
    } else {
      if (!hasRedirected) {
        setHasRedirected(true);
        router.replace('/login');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty array - run only once on mount

  // Global escalation polling - runs every 5 minutes
  useEffect(() => {
    if (!mounted || !user) return;

    const checkEscalations = async () => {
      try {
        await fetch('/api/fuel-prices/escalate', { method: 'POST' });
      } catch (err) {
        console.error('Escalation check failed:', err);
      }
    };

    checkEscalations();
    const interval = setInterval(checkEscalations, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [mounted, user]);

  const handleLogout = () => {
    // 1) Clear local state + localStorage IMMEDIATELY so UI never hangs.
    try {
      setUser(null);
      setSites([]);
      localStorage.removeItem('workflowlite_user');
      localStorage.removeItem('workflowlite_sites');
    } catch {}

    // 2) Best-effort: sign out of Supabase + clear server session. Don't
    //    block on these — the redirect must happen even if they fail.
    try {
      const supabasePromise = (async () => {
        try {
          const { createBrowserClient } = await import('@/lib/supabase');
          const sb = createBrowserClient();
          await sb.auth.signOut();
        } catch {}
      })();
      const apiPromise = fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      Promise.race([
        Promise.allSettled([supabasePromise, apiPromise]),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]).finally(() => {});
    } catch {}

    // 3) Redirect immediately. window.location.href forces a full reload so
    //    every piece of React state, cached fetches, and stale auth tokens
    //    are flushed.
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  const refreshSites = async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/sites');
      const data = await res.json();
      setSites(Array.isArray(data) ? data : []);
      if (Array.isArray(data)) {
        localStorage.setItem('workflowlite_sites', JSON.stringify(data));
      }
    } catch (err) {
      console.error('Failed to refresh sites:', err);
    }
  };

  if (!mounted || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // AppShell wraps the role-specific dashboard. Tab state is driven from
  // the URL `?tab=` via AppShell internals; we receive it via render-prop
  // so we can pass it down to the legacy `activeTab` prop on dashboards.
  return (
    <AppShell user={user} onLogout={handleLogout}>
      {({ activeTab }) => (
        <>
          {user.role === 'staff' && (
            <StaffDashboard user={user} sites={sites} activeTab={activeTab} />
          )}
          {user.role === 'operator' && (
            <OperatorDashboard user={user} sites={sites} activeTab={activeTab} />
          )}
          {user.role === 'owner' && (
            <OwnerDashboard
              user={user}
              sites={sites}
              activeTab={activeTab}
              onRefreshSites={refreshSites}
            />
          )}
        </>
      )}
    </AppShell>
  );
}

// Wrap in Suspense — useSearchParams() requires it in Next.js 15.
export default function App() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-muted/30">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      }
    >
      <AppInner />
    </Suspense>
  );
}
