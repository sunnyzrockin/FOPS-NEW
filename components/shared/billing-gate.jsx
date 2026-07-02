'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CreditCard, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * BillingGate — mounts above the app shell and decides whether the
 * tenant can be used. Behaviour by phase:
 *
 *   trial            → thin banner "X days left", renders children
 *   active           → renders children, no banner
 *   past_due_grace   → amber banner "Update payment in N days", renders children
 *   past_due_locked  → lock screen (owner) or "access paused" (op/staff)
 *   canceled         → reactivate screen (owner) or "access paused" (op/staff)
 *   no_subscription  → owner: finish-setup screen; op/staff: paused screen
 *
 * Server is the source of truth — even if a user bypasses this UI, every
 * write endpoint calls requireActiveSubscription() and returns 402.
 */
export default function BillingGate({ user, children }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch('/api/billing/status');
      const j = await res.json();
      setState(j);
    } catch (e) {
      console.warn('[BillingGate] status load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await authedFetch('/api/billing/portal', { method: 'POST' });
      const j = await res.json();
      if (j.url) window.location.href = j.url;
      else setPortalLoading(false);
    } catch (e) {
      console.error(e); setPortalLoading(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-teal-600" /></div>;
  }

  if (!state) return children;

  const isOwner = state.role === 'owner';
  const phase = state.phase;
  const days = state.daysRemaining;

  // Locked phases — no app access.
  if (state.locked) {
    return (
      <LockScreen
        phase={phase}
        isOwner={isOwner}
        onPortal={openPortal}
        portalLoading={portalLoading}
        onRefresh={load}
      />
    );
  }

  // Allowed but show banner.
  const banner =
    phase === 'trial' ? (
      <Banner tone="teal" icon={<Clock className="h-4 w-4" />}>
        Trial — {days} day{days === 1 ? '' : 's'} left. Card on file; you’ll be auto-charged on day 14.
        {isOwner && (<button onClick={openPortal} className="underline ml-2">Manage billing</button>)}
      </Banner>
    ) : phase === 'past_due_grace' ? (
      <Banner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
        Payment failed. {days} day{days === 1 ? '' : 's'} to update your card before access is paused.
        {isOwner && (<button onClick={openPortal} className="underline ml-2">Update payment</button>)}
      </Banner>
    ) : null;

  return (
    <>
      {banner}
      {state.is_demo && (
        <Banner tone="slate" icon={<CheckCircle2 className="h-4 w-4" />}>
          Demo mode — read-only. FOPS is currently invite-only; join the waitlist at fopsapp.com to become a customer.
        </Banner>
      )}
      {children}
    </>
  );
}

function Banner({ tone, icon, children }) {
  const cls =
    tone === 'teal'  ? 'bg-teal-50 border-teal-200 text-teal-900' :
    tone === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-900' :
    tone === 'red'   ? 'bg-red-50 border-red-200 text-red-900' :
                       'bg-slate-100 border-slate-200 text-slate-700';
  return (
    <div className={`border-b ${cls} px-4 py-2 text-sm flex items-center gap-2`}>
      {icon} <span>{children}</span>
    </div>
  );
}

function LockScreen({ phase, isOwner, onPortal, portalLoading, onRefresh }) {
  const owner = {
    no_subscription: {
      title: 'Finish setting up your tenant',
      body: 'Your account was created but billing checkout didn’t complete. Capture a card to start your 14-day trial.',
      cta: 'Open checkout',
    },
    past_due_locked: {
      title: 'Access paused — payment required',
      body: 'We tried to charge your card and it failed. Update payment to restore access. Your data is safe.',
      cta: 'Update payment',
    },
    canceled: {
      title: 'Subscription canceled',
      body: 'Your subscription is canceled. Reactivate to restore access. Your data is preserved.',
      cta: 'Reactivate',
    },
  }[phase] || {
    title: 'Subscription required',
    body: 'Your account needs an active subscription to continue.',
    cta: 'Open billing',
  };

  if (!isOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <Badge variant="outline" className="w-fit bg-amber-50 text-amber-800 border-amber-200">
              <Clock className="h-3 w-3 mr-1" /> Access paused
            </Badge>
            <CardTitle className="text-xl pt-2">Your tenant is temporarily paused</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Please contact your account owner. They need to update payment in the FOPS billing portal to restore access.</p>
            <p className="text-xs">Your data is safe and will return as soon as billing is current.</p>
            <Button variant="outline" onClick={onRefresh} className="w-full gap-1"><RefreshCw className="h-3.5 w-3.5" /> Check again</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <Badge variant="outline" className="w-fit bg-red-50 text-red-700 border-red-200">
            <AlertTriangle className="h-3 w-3 mr-1" /> {phase === 'canceled' ? 'Canceled' : 'Action required'}
          </Badge>
          <CardTitle className="text-2xl pt-2">{owner.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{owner.body}</p>
          <Button onClick={onPortal} disabled={portalLoading} className="w-full gap-2 bg-teal-600 hover:bg-teal-700">
            {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {owner.cta}
          </Button>
          <Button variant="outline" onClick={onRefresh} className="w-full gap-1"><RefreshCw className="h-3.5 w-3.5" /> I’ve paid — check again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
