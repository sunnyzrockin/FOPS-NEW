'use client';
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/immutability -- pre-existing patterns: hydrate state from API in useEffect; setState in async catch handlers after window.location redirect */

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, ExternalLink, Sparkles, AlertCircle } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { toast } from 'sonner';

/**
 * Billing tab — owner-only. Shows current subscription (if any), the
 * plan catalogue, and Upgrade / Manage buttons that route through
 * Stripe Checkout and the Customer Portal respectively.
 *
 * The data shape returned by /api/stripe/subscription is:
 *   { subscription: row | null, plan: catalogEntry | null, catalog: [...] }
 */
export default function Billing() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [busyTier, setBusyTier] = useState(null);
  const [portalBusy, setPortalBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch('/api/stripe/subscription');
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
    // Show a toast based on Stripe redirect query params
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const checkout = params.get('checkout');
      if (checkout === 'success') {
        toast.success('Subscription started!', {
          description: 'Your plan is active. It may take a moment to appear here.',
        });
      } else if (checkout === 'cancelled') {
        toast.info('Checkout cancelled. No changes were made.');
      }
    }
  }, [load]);

  const handleSubscribe = async (tier) => {
    setBusyTier(tier);
    try {
      const res = await authedFetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (j.url) {
        window.location.href = j.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (e) {
      toast.error('Could not start checkout', { description: e.message });
      setBusyTier(null);
    }
  };

  const handlePortal = async () => {
    setPortalBusy(true);
    try {
      const res = await authedFetch('/api/stripe/portal', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      if (j.url) {
        window.location.href = j.url;
      } else {
        throw new Error('No portal URL returned');
      }
    } catch (e) {
      toast.error('Could not open billing portal', { description: e.message });
      setPortalBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-12 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
      </div>
    );
  }

  const { subscription, plan, catalog = [] } = data || {};
  const activeTier = subscription?.plan_tier || plan?.tier || null;
  const status = subscription?.status || null;
  const niceStatus = (s) => {
    if (!s) return 'Inactive';
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Billing & Subscription</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your FOPS plan. Subscriptions cover all sites under your owner account.
          </p>
        </div>
      </div>

      {/* Current plan card */}
      <Card className="border-teal-200/60 bg-teal-50/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Current Plan
                {subscription && (
                  <Badge
                    variant={status === 'active' || status === 'trialing' ? 'default' : 'secondary'}
                    className={
                      status === 'active' || status === 'trialing'
                        ? 'bg-teal-600 hover:bg-teal-600'
                        : ''
                    }
                  >
                    {niceStatus(status)}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {subscription
                  ? `${plan?.name || subscription.plan_tier || 'Plan'} — ${plan?.monthlyPriceDisplay || ''}/month`
                  : 'No active subscription. Choose a plan below to get started.'}
              </CardDescription>
            </div>

            {subscription && (
              <Button
                onClick={handlePortal}
                disabled={portalBusy}
                variant="outline"
                className="gap-2"
              >
                {portalBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                Manage subscription
              </Button>
            )}
          </div>
        </CardHeader>
        {subscription && (
          <CardContent className="text-sm text-muted-foreground space-y-1">
            {subscription.current_period_end && (
              <div>
                Renews on{' '}
                <span className="font-medium text-foreground">
                  {new Date(subscription.current_period_end).toLocaleDateString()}
                </span>
                {subscription.cancel_at_period_end && (
                  <span className="ml-2 text-amber-600">(cancels at period end)</span>
                )}
              </div>
            )}
            {plan?.siteLimit && (
              <div>
                Site limit:{' '}
                <span className="font-medium text-foreground">{plan.siteLimit} sites</span>
              </div>
            )}
            {plan?.siteLimit === null && (
              <div>
                Site limit: <span className="font-medium text-foreground">Unlimited</span>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Plan catalogue */}
      <div>
        <h2 className="text-lg font-semibold mb-3 text-foreground">Available plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {catalog.map((p) => {
            const isCurrent = activeTier === p.tier;
            const cantBuy = !p.priceConfigured;
            return (
              <Card
                key={p.tier}
                className={
                  p.highlight
                    ? 'border-teal-500 shadow-md relative'
                    : isCurrent
                      ? 'border-teal-300'
                      : ''
                }
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-4 px-2 py-0.5 rounded-md bg-teal-600 text-white text-xs font-medium flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Most popular
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <CardDescription className="min-h-[2.5rem]">{p.description}</CardDescription>
                  <div className="mt-2">
                    <span className="text-3xl font-semibold text-foreground">
                      {p.monthlyPriceDisplay}
                    </span>
                    {p.monthlyPriceDisplay !== 'Custom' && (
                      <span className="text-sm text-muted-foreground ml-1">/ month</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1.5 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-teal-600 mt-0.5 flex-shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {cantBuy ? (
                    <Button disabled variant="outline" className="w-full">
                      <AlertCircle className="h-4 w-4 mr-2" /> Not configured
                    </Button>
                  ) : isCurrent ? (
                    <Button disabled variant="secondary" className="w-full">
                      Current plan
                    </Button>
                  ) : subscription ? (
                    <Button
                      onClick={handlePortal}
                      disabled={portalBusy}
                      variant="outline"
                      className="w-full"
                    >
                      {portalBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Switch plan in portal
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleSubscribe(p.tier)}
                      disabled={busyTier === p.tier}
                      className={
                        p.highlight
                          ? 'w-full bg-teal-600 hover:bg-teal-700 text-white'
                          : 'w-full'
                      }
                    >
                      {busyTier === p.tier ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Subscribe
                    </Button>
                  )}

                  {cantBuy && (
                    <p className="text-[11px] text-muted-foreground">
                      Stripe Price ID missing — set <code>{p.tier === 'starter' ? 'STRIPE_PRICE_STARTER' : p.tier === 'growth' ? 'STRIPE_PRICE_GROWTH' : 'STRIPE_PRICE_ENTERPRISE'}</code> in environment.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Payments are processed securely by Stripe. You can cancel or change plans any time
        from the Manage subscription portal.
      </p>
    </div>
  );
}
