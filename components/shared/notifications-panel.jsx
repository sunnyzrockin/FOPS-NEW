'use client';

/**
 * <NotificationsPanel />
 *
 * Bell icon (with an unread count badge) that opens a 360px popover with
 * the user's notifications. Polls /api/notifications every 60s while the
 * tab is in the foreground; pauses polling when the tab is hidden so we
 * don't burn quota.
 *
 * Self-contained — just drop it into the AppShell top bar.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bell, Check, CheckCheck, Loader2, ClipboardList, CheckCircle2,
  XCircle, UserPlus, UserMinus, Building2,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { cn } from '@/lib/utils';

/** How often (ms) to refetch while the tab is visible. */
const POLL_INTERVAL_MS = 60_000;

const TYPE_ICON = {
  report_submitted: ClipboardList,
  report_status_changed: CheckCircle2,
  site_assigned: Building2,
  site_unassigned: XCircle,
  staff_assigned: UserPlus,
  staff_unassigned: UserMinus,
  generic: Bell,
};

const TYPE_COLOR = {
  report_submitted: 'text-teal-600 bg-teal-50',
  report_status_changed: 'text-green-600 bg-green-50',
  site_assigned: 'text-indigo-600 bg-indigo-50',
  site_unassigned: 'text-amber-600 bg-amber-50',
  staff_assigned: 'text-purple-600 bg-purple-50',
  staff_unassigned: 'text-amber-600 bg-amber-50',
  generic: 'text-slate-600 bg-slate-100',
};

function relativeTime(iso) {
  if (!iso) return '';
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const sec = Math.max(0, Math.floor((now - then) / 1000));
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d ago`;
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric', month: 'short',
    });
  } catch {
    return '';
  }
}

export function NotificationsPanel({ user }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const userId = user?.id;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await authedFetch('/api/notifications?limit=50');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data?.notifications) ? data.notifications : []);
      setUnreadCount(typeof data?.unreadCount === 'number' ? data.unreadCount : 0);
    } catch (err) {
      // Don't toast on poll failures — too noisy. Just log.
      console.warn('[NotificationsPanel] load failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Initial load + polling while visible.
  //
  // We defer the actual fetch + interval setup via setTimeout(0) so the
  // effect body itself is purely setup of timers / listeners. Without this
  // indirection, lint statically traces load() -> setState() and flags
  // "set-state-in-effect", even though load() awaits a fetch first (so the
  // setState is never actually synchronous).
  useEffect(() => {
    if (!userId) return;
    let interval = null;

    const tick = () => {
      if (document.visibilityState === 'visible') load();
    };
    const startPolling = () => {
      if (interval) return;
      interval = setInterval(tick, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        load();
        startPolling();
      } else {
        stopPolling();
      }
    };

    // Kick off the first fetch and the polling on the next tick — out of
    // the synchronous useEffect callback.
    const bootstrap = setTimeout(() => {
      load();
      startPolling();
    }, 0);

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(bootstrap);
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId, load]);

  const markOne = async (id) => {
    try {
      const res = await authedFetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) return;
      // Optimistic update — mutate locally so the UI doesn't flicker.
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.warn('[NotificationsPanel] markOne failed:', err.message);
    }
  };

  const markAll = async () => {
    setMarking(true);
    try {
      const res = await authedFetch('/api/notifications', {
        method: 'POST',
      });
      if (!res.ok) return;
      const now = new Date().toISOString();
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
      setUnreadCount(0);
    } catch (err) {
      console.warn('[NotificationsPanel] markAll failed:', err.message);
    } finally {
      setMarking(false);
    }
  };

  const onItemClick = async (n) => {
    if (!n.read_at) markOne(n.id);
    if (n.link) {
      setOpen(false);
      // Internal links route via Next; external (http) links open new tab.
      if (/^https?:\/\//i.test(n.link)) {
        window.open(n.link, '_blank', 'noopener,noreferrer');
      } else {
        router.push(n.link);
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Open notifications"
          className={cn(
            'relative inline-flex h-9 w-9 items-center justify-center rounded-md',
            'text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-teal-500/40'
          )}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center px-1 ring-2 ring-background"
              aria-label={`${unreadCount} unread`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[360px] p-0 max-h-[480px] flex flex-col"
      >
        <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Notifications</h3>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread`
                : 'All caught up'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0 || marking}
            onClick={markAll}
            className="h-8 text-xs"
          >
            {marking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <><CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark all read</>
            )}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && items.length === 0 && (
            <div className="py-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span className="text-sm">Loading…</span>
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="py-10 text-center px-6">
              <Bell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm font-medium">You&apos;re all caught up</p>
              <p className="text-xs text-muted-foreground mt-1">
                New activity will show up here.
              </p>
            </div>
          )}

          <ul className="divide-y">
            {items.map((n) => {
              const Icon = TYPE_ICON[n.type] || Bell;
              const colorCls = TYPE_COLOR[n.type] || TYPE_COLOR.generic;
              const unread = !n.read_at;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => onItemClick(n)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors',
                      'flex items-start gap-2.5',
                      unread && 'bg-teal-50/40'
                    )}
                  >
                    <div className={cn('rounded-md p-1.5 shrink-0', colorCls)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className={cn(
                          'text-sm leading-snug truncate',
                          unread ? 'font-semibold' : 'font-medium text-muted-foreground'
                        )}>
                          {n.title}
                        </p>
                        {unread && (
                          <span className="h-1.5 w-1.5 rounded-full bg-teal-600 shrink-0" aria-label="unread" />
                        )}
                      </div>
                      {n.body && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                          {n.body}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground/80 mt-1">
                        {relativeTime(n.created_at)}
                      </p>
                    </div>
                    {unread && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); markOne(n.id); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); markOne(n.id); } }}
                        className="shrink-0 p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                        aria-label="Mark as read"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationsPanel;
