'use client';

/**
 * <OnboardingModal />
 *
 * A small, role-aware 3-step welcome modal shown to a user the first time
 * they log into FOPS. The flow is intentionally lightweight: a brief
 * welcome, a few "what you can do here" highlights, and a closing CTA.
 *
 * The modal calls PATCH /api/users/me with { first_login: false } when the
 * user finishes (or skips) so it never appears again. We DON'T flip the flag
 * on initial mount — only on completion — so partial closes (eg. accidental
 * page refresh) leave them with one more shot at the tour.
 *
 * Props:
 *   open      boolean      - controls visibility
 *   onClose   () => void   - called when the user finishes or skips
 *   user      { name, role } - drives the per-role copy
 *
 * Wiring this in lives at the AppShell level (next commit) — keeping the
 * modal stateless lets it be portable for Storybook / preview routes.
 */

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Sparkles, Building2, Users, ClipboardList, BarChart3, Bell,
  HelpCircle, Fuel, CheckCircle2, ArrowRight,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/* ---------------------------------------------------------------- */
/*  ROLE-SPECIFIC CONTENT                                           */
/* ---------------------------------------------------------------- */

const ROLE_CONTENT = {
  owner: {
    title: (name) => `Welcome to FOPS, ${name || 'Owner'}`,
    subtitle:
      "You're now in command of the Sunstate Group portfolio. Let's walk through the basics.",
    steps: [
      {
        icon: Building2,
        title: 'Manage your sites & operators',
        body:
          'Add or edit sites, assign operators to the sites they run, and revoke access in a single click. Operators only see the sites you assign to them.',
      },
      {
        icon: BarChart3,
        title: 'Live portfolio insights',
        body:
          'Your dashboard rolls up shift submissions, fuel volume, and banking variance across every site. Drill into monthly reports for the detail you need.',
      },
      {
        icon: Bell,
        title: 'Stay in the loop',
        body:
          'Notifications and the in-app help panel keep you across submissions, price changes, and anything that needs your attention.',
      },
    ],
  },
  operator: {
    title: (name) => `Welcome to FOPS, ${name || 'Operator'}`,
    subtitle:
      "You're the day-to-day owner of your sites. Here's how to get going.",
    steps: [
      {
        icon: Users,
        title: 'Invite & manage your staff',
        body:
          'Use Staff Management to invite team members by email or pick from existing users. Each invite goes out via a secure magic link — no passwords to share.',
      },
      {
        icon: Fuel,
        title: 'Set fuel prices & monitor competitors',
        body:
          'Update pump prices from the Fuel Pricing panel and watch local competitor pricing on the QLD Live Prices map.',
      },
      {
        icon: ClipboardList,
        title: 'Review shift submissions',
        body:
          'Staff shift reports land in Banking Submissions for your sign-off. Variance and banking discrepancies are flagged automatically.',
      },
    ],
  },
  staff: {
    title: (name) => `Welcome aboard, ${name || 'team'}`,
    subtitle:
      "Submitting shift reports is now faster and cleaner. Here's the quick tour.",
    steps: [
      {
        icon: ClipboardList,
        title: 'Submit your shift report',
        body:
          'The Shift Report form auto-saves as you type — no more lost work if the tablet locks. Numeric fields accept Excel-style formulas like "+2450+1360".',
      },
      {
        icon: CheckCircle2,
        title: 'See your submission status',
        body:
          'Once submitted, you can track whether your operator has reviewed and approved the shift, right from your dashboard.',
      },
      {
        icon: HelpCircle,
        title: 'Help is one click away',
        body:
          'Stuck on a field? Tap the "?" icon in the bottom-right corner for in-app guidance, FAQs, and a way to contact your operator.',
      },
    ],
  },
};

function pickContent(role, name) {
  const content = ROLE_CONTENT[role] || ROLE_CONTENT.staff;
  return {
    title: content.title(name),
    subtitle: content.subtitle,
    steps: content.steps,
  };
}

/* ---------------------------------------------------------------- */
/*  COMPONENT                                                       */
/* ---------------------------------------------------------------- */

export function OnboardingModal({ open, onClose, user }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const role = user?.role || 'staff';
  const name = user?.name?.split(' ')[0]; // first name only for warmth

  const { title, subtitle, steps } = useMemo(
    () => pickContent(role, name),
    [role, name]
  );

  const totalSteps = steps.length;
  const isLast = stepIndex === totalSteps - 1;
  const StepIcon = steps[stepIndex]?.icon || Sparkles;

  const finish = async () => {
    // Persist the flip-off. If the network fails we still close the modal —
    // surfacing the modal again on the next reload is the lesser evil vs.
    // blocking the user mid-flow on a flaky network.
    setSubmitting(true);
    try {
      const res = await authedFetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_login: false }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      // Non-blocking — the user is finishing the tour either way.
      console.warn('[OnboardingModal] could not persist first_login flag:', err);
      toast.error("Couldn't save your preference", {
        description: 'We may show this welcome again next time you log in.',
      });
    } finally {
      setSubmitting(false);
      setStepIndex(0); // reset for the next time this instance is reused
      onClose?.();
    }
  };

  const next = () => {
    if (isLast) {
      finish();
    } else {
      setStepIndex((i) => Math.min(i + 1, totalSteps - 1));
    }
  };

  const back = () => setStepIndex((i) => Math.max(i - 1, 0));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Treat any external close (overlay click / Esc) the same as "Skip".
        if (!o) finish();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal-600" />
            <span>{title}</span>
          </DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        {/* Step body */}
        <div className="py-3">
          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
            <div className="rounded-md bg-teal-50 text-teal-700 p-2 shrink-0">
              <StepIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold leading-snug">
                {steps[stepIndex]?.title}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {steps[stepIndex]?.body}
              </p>
            </div>
          </div>

          {/* Step dots */}
          <div
            className="mt-4 flex items-center justify-center gap-1.5"
            aria-label={`Step ${stepIndex + 1} of ${totalSteps}`}
          >
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === stepIndex
                    ? 'w-6 bg-teal-600'
                    : 'w-1.5 bg-muted-foreground/30'
                )}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {stepIndex > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={back}
              disabled={submitting}
            >
              Back
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={finish}
              disabled={submitting}
            >
              Skip
            </Button>
          )}
          <Button type="button" onClick={next} disabled={submitting}>
            {isLast ? (
              submitting ? 'Saving…' : 'Get started'
            ) : (
              <>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default OnboardingModal;
