'use client';
/* eslint-disable react-hooks/set-state-in-effect -- pre-existing pattern: hydrate state from API in useEffect */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ExternalLink, CreditCard, Check, Info, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { toast } from 'sonner';

/**
 * Billing tab — owner-only. v2 (per-site, single plan).
 *
 * Reads /api/billing/status which returns the canonical:
 *   { phase, status, locked, daysRemaining, quantity, trial_end,
 *     grace_ends_at, config: { base_amount_cents, per_site_amount_cents,
 *     currency, trial_days, grace_days } }
 *
 * Renders: base + per-site × quantity in AUD (or whatever currency the
 * API returned), trial/grace banners, and a Manage in Stripe Portal CTA.
 * No tier/catalog UI — that model was retired.
 */
export default function Billing() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [resyncBusy, setResyncBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/billing/status');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      toast.error('Failed to load billing details', { description: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const checkout = params.get('checkout') || params.get('signup');
      if (checkout === 'success' || checkout === 'complete') {
        toast.success('Subscription started!', {
          description: 'Your trial is active. Card will be charged on day 14.',
        });
      } else if (checkout === 'cancelled') {
        toast.info('Checkout cancelled. No changes were made.');
      }
    }
  }, [load]);

  const handlePortal = async () => {
    setPortalBusy(true);
    try {
      const res = await authedFetch('/api/billing/portal', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (j.url) window.location.href = j.url;
      else throw new Error('No portal URL returned');
    } catch (e) {
      toast.error('Could not open billing portal', { description: e.message });
      setPortalBusy(false);
    }
  };

  const handleResync = async () => {
    setResyncBusy(true);
    try {
      const res = await authedFetch('/api/billing/sync-quantity', { method: 'POST' });
      const j = await res.json();
      if (!res.ok || j?.ok === false) {
        throw new Error(j.error || j.reason || `HTTP ${res.status}`);
      }
      if (j.unchanged) {
        toast.success(`Already in sync — billing ${j.quantity} site${j.quantity === 1 ? '' : 's'}`);
      } else {
        toast.success(`Synced — billing updated from ${j.previous} to ${j.quantity} site${j.quantity === 1 ? '' : 's'}`);
      }
      await load();
    } catch (e) {
      toast.error('Resync failed', { description: e.message });
    } finally {
      setResyncBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    );
  }

  const cfg = data?.config || {};
  const currency = (cfg.currency || 'aud').toUpperCase();
  const qty = Math.max(1, Number(data?.quantity) || 1);
  const siteCount = data?.site_count != null ? Number(data.site_count) : null;
  const quantityDrift = !!data?.quantity_drift;
  const baseAUD = (cfg.base_amount_cents || 0) / 100;
  const perSiteAUD = (cfg.per_site_amount_cents || 0) / 100;
  const totalAUD = baseAUD + perSiteAUD * qty;

  const fmt = (n) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .format(n);

  const phase = data?.phase;
  const status = data?.status;
  const days = data?.daysRemaining;

  const phaseBadge = (() => {
    switch (phase) {
      case 'trial':
        return <Badge className="bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-100"><Clock className="h-3 w-3 mr-1" />Trial · {days}d left</Badge>;
      case 'active':
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100"><Check className="h-3 w-3 mr-1" />Active</Badge>;
      case 'past_due_grace':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100"><AlertTriangle className="h-3 w-3 mr-1" />Past due · {days}d to update</Badge>;
      case 'past_due_locked':
        return <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100"><AlertTriangle className="h-3 w-3 mr-1" />Access paused</Badge>;
      case 'canceled':
        return <Badge variant="outline">Canceled</Badge>;
      case 'no_subscription':
        return <Badge variant="outline">No subscription</Badge>;
      default:
        return <Badge variant="outline">{status || 'Unknown'}</Badge>;
    }
  })();

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Billing & Subscription</h1>
        <p className="text-sm text-muted-foreground mt-1">
          You pay one base fee plus one per-site fee for every active site. All features are included on every site.
        </p>
      </div>

      {/* Drift banner — billed qty != live site count. Surfaces silent
          quantity-sync failures so the owner can self-heal. */}
      {quantityDrift && siteCount != null && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-4 pb-4 flex items-start gap-3 flex-wrap">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-[260px]">
              <div className="text-sm font-medium text-amber-900">
                Billing quantity is out of sync with your active sites.
              </div>
              <div className="text-xs text-amber-800 mt-1">
                Stripe is billing for <span className="font-semibold">{qty} site{qty === 1 ? '' : 's'}</span>,
                but you have <span className="font-semibold">{siteCount} active site{siteCount === 1 ? '' : 's'}</span>.
                Click resync to update Stripe — proration is applied to your next invoice.
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleResync}
              disabled={resyncBusy}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
            >
              {resyncBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Resync now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Current plan card — replaces the old tier UI */}
      <Card className="border-teal-200/60 bg-teal-50/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Current Plan {phaseBadge}
              </CardTitle>
              <CardDescription>
                Per-site pricing &middot; billed for {qty} active site{qty === 1 ? '' : 's'}
                {siteCount != null && siteCount !== qty && (
                  <span className="text-amber-700 font-medium"> &middot; {siteCount} live</span>
                )}
              </CardDescription>
            </div>
            {data?.subscription || phase !== 'no_subscription' ? (
              <Button onClick={handlePortal} disabled={portalBusy} variant="outline" className="gap-2">
                {portalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                Manage in Stripe portal
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Headline price */}
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-foreground">{fmt(totalAUD)}</span>
            <span className="text-sm text-muted-foreground">/ month</span>
          </div>

          {/* Breakdown */}
          <div className="rounded-lg border bg-white/60 divide-y">
            <Row label="Base" right={`${fmt(baseAUD)} / month`} />
            <Row
              label={`Per site × ${qty}`}
              right={`${fmt(perSiteAUD)} × ${qty} = ${fmt(perSiteAUD * qty)} / month`}
            />
            <Row
              label="Total"
              right={<span className="font-semibold">{fmt(totalAUD)} / month</span>}
            />
          </div>

          {/* Trial / grace context */}
          {phase === 'trial' && data?.trial_end && (
            <div className="text-xs text-muted-foreground flex items-start gap-2">
              <Info className="h-3.5 w-3.5 mt-0.5" />
              <span>
                Trial — card on file, you&apos;ll be auto-charged on {new Date(data.trial_end).toLocaleDateString()}{' '}
                ({days} day{days === 1 ? '' : 's'} from now). Cancel any time before then to avoid the charge.
              </span>
            </div>
          )}
          {phase === 'past_due_grace' && data?.grace_ends_at && (
            <div className="text-xs text-amber-700 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
              <span>
                Last charge failed. Update your card before {new Date(data.grace_ends_at).toLocaleDateString()} or access will be paused.
              </span>
            </div>
          )}
          {phase === 'past_due_locked' && (
            <div className="text-xs text-red-700 flex items-start gap-2 bg-red-50 border border-red-200 rounded-md p-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
              <span>Access paused — update your card to resume.</span>
            </div>
          )}

          {/* Empty-sub CTA */}
          {phase === 'no_subscription' && (
            <Button onClick={handlePortal} className="gap-2 bg-teal-600 hover:bg-teal-700 text-white">
              <CreditCard className="h-4 w-4" /> Finish billing setup
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Plan inclusions — replaces the empty "Available plans" section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What&apos;s included on every site</CardTitle>
          <CardDescription>One plan, everything on. No feature gating.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {[
              'Shift reports & banking',
              'Tier 1 wet-stock reconciliation',
              'Daily tank variance alerts',
              'Banking formula engine',
              'Analytics Explorer',
              'Competitor fuel price tracking',
              'Unlimited operators & staff',
              'Stripe-managed billing & invoices',
            ].map((f) => (
              <li key={f} className="flex items-start gap-2">
                <Check className="h-4 w-4 text-teal-600 mt-0.5 flex-shrink-0" /> <span>{f}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Monthly billing in {currency}. Cancel any time from the Stripe portal — no lock-in.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, right }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{right}</span>
    </div>
  );
}
