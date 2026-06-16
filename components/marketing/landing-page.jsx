'use client';

/**
 * Public landing page for FOPS — Field Operations System.
 *
 * Conversion-focused marketing page for Australian fuel operators.
 *
 *  Above the fold:  pain-point headline + Start-Trial / Explore-Demo CTAs
 *  Trust strip:     Queensland-built badge + key stats
 *  Problem:         the daily pain (WhatsApp, paper, spreadsheets)
 *  Solution:        6 feature blocks tied to the pain
 *  Hierarchy:       Owner → Operator → Staff role story
 *  Social proof:    placeholder testimonial quotes (swap for real ones)
 *  FAQ:             pure-CSS accordion using <details>
 *  Final CTA:       Start-trial banner + Talk-to-sales mailto
 *
 * Implementation notes:
 *   - Sales contact uses mailto only ("Talk to sales"). Avoid using the
 *     word "demo" for sales — it collides with the self-serve sandbox.
 *   - Pricing table intentionally omitted; Stripe wiring exists in-app
 *     but the public site is contact-led for now.
 *   - Design palette: warm off-white #FAFAF6, deep navy #0E1B2A, teal CTAs.
 */

import Link from 'next/link';
import {
  Menu, X, ChevronDown, ArrowRight, Check, Fuel, LineChart,
  ClipboardList, Calculator, Building2, Users, ClipboardCheck,
  Sparkles, Mail, MapPin, Smartphone, ShieldCheck, PlayCircle,
  TrendingUp, MessageSquareOff, FileSpreadsheet, Banknote, Quote,
} from 'lucide-react';
import { useState } from 'react';

// (CALENDLY_URL removed — sales contact via mailto only, see header note above.)
// Sales contact is via mailto only (label: "Talk to sales") — avoid using
// the word "demo" for sales calls so it doesn't collide with the
// self-serve "Explore the demo" sandbox CTA.

const PRIMARY_CTA_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition ' +
  'bg-teal-600 hover:bg-teal-700';

const SECONDARY_CTA_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition ' +
  'border border-[#0E1B2A]/15 text-[#0E1B2A] hover:bg-[#0E1B2A]/5';

/* ============================================================ */
/*  HEADER                                                      */
/* ============================================================ */
function NavItem({ label, items, href }) {
  if (href) {
    return (
      <a
        href={href}
        className="text-sm font-medium text-[#0E1B2A]/80 hover:text-[#0E1B2A] transition-colors"
      >
        {label}
      </a>
    );
  }
  return (
    <div className="group relative">
      <button className="inline-flex items-center gap-1 text-sm font-medium text-[#0E1B2A]/80 hover:text-[#0E1B2A] transition-colors">
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <div className="invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100">
        <div className="min-w-[220px] rounded-md border border-[#0E1B2A]/10 bg-white p-2 shadow-lg">
          {items.map((it) => (
            <a
              key={it.label}
              href={it.href || '#'}
              className="block rounded px-3 py-2 text-sm text-[#0E1B2A]/80 hover:bg-[#FAFAF6] hover:text-[#0E1B2A]"
            >
              {it.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const NAV = [
    { label: 'Features', items: [
      { label: 'Multi-site dashboard', href: '#features' },
      { label: 'Mobile shift reports',  href: '#features' },
      { label: 'Banking formulas',      href: '#features' },
      { label: 'Fuel price intel',      href: '#features' },
    ]},
    { label: 'How it works', href: '#how' },
    { label: 'FAQ',          href: '#faq' },
    { label: 'Contact',      href: '#contact' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[#0E1B2A]/10 bg-[#FAFAF6]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-600 text-white">
            <Fuel className="h-4 w-4" />
          </span>
          <span className="text-base font-semibold tracking-tight text-[#0E1B2A]">FOPS</span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-7 md:flex">
          {NAV.map((n) => <NavItem key={n.label} {...n} />)}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className={SECONDARY_CTA_CLASS}>Log in</Link>
          <Link href="/signup" className={PRIMARY_CTA_CLASS}>
            Start 14-day trial <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-[#0E1B2A] hover:bg-[#0E1B2A]/5 md:hidden"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-[#0E1B2A]/10 bg-white md:hidden">
          <div className="mx-auto max-w-6xl space-y-1 px-4 py-3">
            {NAV.map((n) => (
              <a
                key={n.label}
                href={n.href || (n.items && n.items[0]?.href) || '#'}
                className="block rounded px-3 py-2 text-sm font-medium text-[#0E1B2A]/85 hover:bg-[#FAFAF6]"
                onClick={() => setMobileOpen(false)}
              >
                {n.label}
              </a>
            ))}
            <div className="flex gap-2 pt-2">
              <Link href="/login" className={`${SECONDARY_CTA_CLASS} flex-1`}>Log in</Link>
              <Link href="/signup" className={`${PRIMARY_CTA_CLASS} flex-1`}>Start 14-day trial</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/* ============================================================ */
/*  HERO                                                         */
/* ============================================================ */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,_rgba(13,148,136,0.10),_transparent_55%)]" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        {/* COPY */}
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0E1B2A]/10 bg-white/70 px-3 py-1 text-xs font-medium text-[#0E1B2A]/70">
            <MapPin className="h-3 w-3 text-teal-600" />
            Built in Queensland · for Australian fuel operators
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-[#0E1B2A] sm:text-5xl lg:text-[3.4rem]">
            Stop running your servos on{' '}
            <span className="line-through decoration-red-500 decoration-[3px]">WhatsApp.</span>
            <br />
            <span className="text-teal-700">Run them on FOPS.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-[#0E1B2A]/75">
            Multi-site fuel station management for Australian operators.
            Shift reports on a phone in under two minutes, banking formulas
            that close themselves, and a live view of every site in one
            dashboard — without the spreadsheets.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className={`${PRIMARY_CTA_CLASS} text-base px-6 py-3`}>
              Start 14-day trial <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch('/api/auth/demo-login', { method: 'POST' });
                  const data = await res.json();
                  if (!res.ok || !data.session) {
                    alert(data.error || 'Demo unavailable right now.');
                    return;
                  }
                  localStorage.setItem('fopsapp_user', JSON.stringify(data.user));
                  localStorage.setItem('fopsapp_sites', JSON.stringify(data.sites || []));
                  localStorage.setItem('supabase-session', JSON.stringify(data.session));
                  try {
                    const { createBrowserClient } = await import('@/lib/supabase');
                    const sb = createBrowserClient();
                    await sb.auth.setSession({
                      access_token: data.session.access_token,
                      refresh_token: data.session.refresh_token,
                    });
                  } catch (_) {}
                  window.location.href = '/app';
                } catch (e) {
                  alert('Demo unavailable: ' + (e?.message || 'unknown'));
                }
              }}
              className={`${SECONDARY_CTA_CLASS} text-base px-6 py-3`}
            >
              <PlayCircle className="h-4 w-4" /> Explore the demo
            </button>
          </div>

          <div className="mt-6 flex items-center gap-5 text-xs text-[#0E1B2A]/60">
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-teal-600" /> Card on file, charged after day 14</span>
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-teal-600" /> No lock-in, cancel any time</span>
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-teal-600" /> Live in 48 hours</span>
          </div>
        </div>

        {/* HERO IMAGE — fuel station forecourt at dusk */}
        <div className="relative">
          <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-[#0E1B2A]/10 bg-[#0E1B2A] shadow-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1585740452884-2a29a1d21514?w=1200&q=80&auto=format&fit=crop"
              alt="Modern fuel station forecourt at dusk"
              className="h-full w-full object-cover"
            />
          </div>
          {/* Floating stat card */}
          <div className="absolute -bottom-6 -left-6 hidden rounded-xl border border-[#0E1B2A]/10 bg-white p-4 shadow-lg sm:block">
            <p className="text-xs font-medium text-[#0E1B2A]/60">Avg shift report time</p>
            <p className="text-2xl font-bold text-[#0E1B2A]">1m 47s</p>
            <p className="mt-1 text-[11px] text-teal-700">↓ from 12 min on paper</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  TRUST STRIP                                                 */
/* ============================================================ */
function TrustStrip() {
  const stats = [
    { value: '7+',     label: 'Sites live on FOPS' },
    { value: '<2 min', label: 'Avg shift submission' },
    { value: '100%',   label: 'Banking auto-reconciled' },
    { value: 'QLD',    label: 'Built locally' },
  ];
  return (
    <section className="border-y border-[#0E1B2A]/10 bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-3xl font-bold text-teal-700">{s.value}</p>
            <p className="mt-1 text-xs text-[#0E1B2A]/60">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================ */
/*  PROBLEM SECTION                                             */
/* ============================================================ */
function ProblemSection() {
  const pains = [
    {
      icon: MessageSquareOff,
      title: 'WhatsApp updates getting lost',
      body: 'Photos of paper sheets, blurry till receipts, "did you bank yesterday?" texts at 9pm.',
    },
    {
      icon: FileSpreadsheet,
      title: 'Spreadsheets that never balance',
      body: 'Three different Excel files. Two different totals. One stressed owner.',
    },
    {
      icon: TrendingUp,
      title: 'Fuel margin guesswork',
      body: 'You know what you sold. You don\'t actually know what each litre cost.',
    },
  ];
  return (
    <section className="bg-[#FAFAF6] py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-red-600">The daily pain</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0E1B2A] sm:text-4xl">
            Running multiple servos shouldn&apos;t feel like a group chat.
          </h2>
          <p className="mt-4 text-base text-[#0E1B2A]/70">
            Most owners we talk to have the same three problems. Every. Single. Day.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {pains.map((p) => (
            <div key={p.title} className="rounded-xl border border-[#0E1B2A]/10 bg-white p-6">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#0E1B2A]">{p.title}</h3>
              <p className="mt-2 text-sm text-[#0E1B2A]/70">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  FEATURES (6 blocks)                                         */
/* ============================================================ */
function FeatureBlock({ icon: Icon, eyebrow, title, body, bullets, image, imageAlt, reverse }) {
  return (
    <div className={`grid items-center gap-10 lg:grid-cols-2 ${reverse ? 'lg:[direction:rtl]' : ''}`}>
      <div className="[direction:ltr]">
        <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">{eyebrow}</span>
        <h3 className="mt-3 text-2xl font-bold tracking-tight text-[#0E1B2A] sm:text-3xl">{title}</h3>
        <p className="mt-3 text-base text-[#0E1B2A]/75">{body}</p>
        {bullets && (
          <ul className="mt-5 space-y-2.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm text-[#0E1B2A]/80">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="[direction:ltr]">
        {image ? (
          <div className="overflow-hidden rounded-xl border border-[#0E1B2A]/10 bg-white shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={imageAlt} className="aspect-[5/3] w-full object-cover" />
          </div>
        ) : (
          <div className="flex aspect-[5/3] items-center justify-center rounded-xl border border-[#0E1B2A]/10 bg-white shadow-sm">
            <Icon className="h-20 w-20 text-teal-600/30" />
          </div>
        )}
      </div>
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="bg-white py-20">
      <div className="mx-auto max-w-6xl space-y-20 px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">Everything in one place</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0E1B2A] sm:text-4xl">
            Built for the way Australian operators actually work.
          </h2>
          <p className="mt-4 text-base text-[#0E1B2A]/70">
            Not a generic point-of-sale. Not a glorified spreadsheet. A purpose-built
            ops platform shaped by real Queensland fuel businesses.
          </p>
        </div>

        <FeatureBlock
          icon={Building2}
          eyebrow="MULTI-SITE DASHBOARD"
          title="See every site, in real time, in one window."
          body="Open one dashboard and see fuel sales, shop sales, banking, dips and drive-offs across every servo you own — yesterday, this week, this month. Drill into a single station with one click."
          bullets={[
            'KPI strip with shop, fuel, dips, drive-offs, banking per site',
            'Daily summary rollups across the portfolio',
            'Variance alerts when a site drifts from its baseline',
            'Excel + PDF exports for accountants and BAS time',
          ]}
        />

        <FeatureBlock
          icon={Smartphone}
          eyebrow="MOBILE SHIFT REPORTS"
          title="Staff finish a shift report in under two minutes."
          body="A mobile-first wizard your team can use on the forecourt during change-over. Auto-detects the shift, autosaves as drafts, validates fuel dips and till counts before submission. No app to install."
          bullets={[
            'Mobile wizard with 4-step flow: shift → sales → fuel → review',
            'Excel-style arithmetic in any field ("+2450+1360")',
            'Draft autosave restores after accidental browser close',
            'One-tap submit — owner sees it on their phone instantly',
          ]}
          image="https://images.unsplash.com/photo-1621255457330-7ef4e88ec27f?w=900&q=80&auto=format&fit=crop"
          imageAlt="Station attendant submitting a shift report on their phone"
          reverse
        />

        <FeatureBlock
          icon={Calculator}
          eyebrow="BANKING FORMULAS"
          title="Till reconciliation that closes itself."
          body="Build a banking formula once — cash + EFTPOS + giftcards − floats − payouts — and FOPS calculates the expected banking on every shift report. Variance is flagged automatically; the spreadsheet goes in the bin."
          bullets={[
            'Drag-and-drop formula builder (no Excel hell)',
            'Per-site, per-shift banking calculations on submit',
            'Pending review queue for the operator to sign off',
            'Audit trail of every calculation back to the raw inputs',
          ]}
        />

        <FeatureBlock
          icon={LineChart}
          eyebrow="FUEL PRICE INTELLIGENCE"
          title="Know your competitors before you set the board."
          body="Pulls live Queensland fuel price data so you can see what every nearby site is charging at 5am — before you change your board. Includes a Morning Brief that lands in your Owner dashboard."
          bullets={[
            'Live QLD competitor prices in your area',
            'Morning Price Brief — a one-glance overview',
            'Track your price history vs the market',
            'Get notified when a competitor drops their price',
          ]}
          image="https://www.publicdomainpictures.net/pictures/110000/velka/gas-price-sign.jpg"
          imageAlt="Electronic fuel price board showing ULP and diesel prices"
          reverse
        />

        <FeatureBlock
          icon={Fuel}
          eyebrow="WET-STOCK + FUEL MARGIN"
          title="Stop guessing — measure litre-by-litre."
          body="FOPS reconciles dips against book stock automatically (deliveries minus sales) and computes gross margin per litre using a moving weighted-average cost. Spot leaks, drift, and theft before they bleed your bottom line."
          bullets={[
            'Wet-stock variance alerts (red / amber / green per site)',
            'Cents-per-litre margin by grade (ULP / Diesel / Premium)',
            'Self-healing cost basis as new deliveries roll in',
            'Tolerance settings per site — you decide what counts',
          ]}
        />

        <FeatureBlock
          icon={Users}
          eyebrow="ROLES & HIERARCHY"
          title="Owner → Operator → Staff, properly separated."
          body="Three role tiers with real access boundaries. Owners see the whole portfolio. Operators run one or more sites and approve shifts. Staff submit only — they never see banking secrets, margins, or other people&apos;s sites."
          bullets={[
            'Per-site assignment for operators and staff',
            'Magic-link invites — no shared passwords',
            'Row-level security enforced at the database level',
            'Full audit log of who saw what, when',
          ]}
        />
      </div>
    </section>
  );
}

/* ============================================================ */
/*  HIERARCHY VISUAL                                            */
/* ============================================================ */
function HierarchySection() {
  const tiers = [
    {
      icon: Building2,
      title: 'Owner',
      pitch: 'Sees the entire portfolio. Approves margins. Sets pricing strategy. Exports to accounting.',
      cls:   'bg-teal-50 border-teal-200 text-teal-900',
      dot:   'bg-teal-600',
    },
    {
      icon: ClipboardCheck,
      title: 'Operator',
      pitch: 'Runs one or more sites. Reviews shift reports. Owns the staff roster. Manages banking formulas.',
      cls:   'bg-cyan-50 border-cyan-200 text-cyan-900',
      dot:   'bg-cyan-600',
    },
    {
      icon: ClipboardList,
      title: 'Staff',
      pitch: 'Submits shift reports from their phone. Sees only their site. Never sees banking secrets.',
      cls:   'bg-amber-50 border-amber-200 text-amber-900',
      dot:   'bg-amber-600',
    },
  ];
  return (
    <section id="how" className="bg-[#FAFAF6] py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">How it works</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0E1B2A] sm:text-4xl">
            Three roles. Clean boundaries. Zero WhatsApp.
          </h2>
          <p className="mt-4 text-base text-[#0E1B2A]/70">
            Replace the group chat with a hierarchy that mirrors how your business actually runs.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {tiers.map((t, idx) => (
            <div key={t.title} className={`relative rounded-xl border p-6 ${t.cls}`}>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-white ${t.dot}`}>
                  <t.icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider opacity-70">Tier {idx + 1}</span>
              </div>
              <h3 className="mt-4 text-xl font-bold">{t.title}</h3>
              <p className="mt-2 text-sm opacity-80">{t.pitch}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-[#0E1B2A]/60">
          <ShieldCheck className="-mt-0.5 mr-1.5 inline h-4 w-4 text-teal-600" />
          Row-level security enforced at the database layer — operators can&apos;t see other operators&apos; sites, ever.
        </p>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  DEMO VIDEO PLACEHOLDER                                      */
/* ============================================================ */
function DemoVideo() {
  return (
    <section id="demo-video" className="bg-white py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">See it in action</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0E1B2A] sm:text-4xl">
            A 2-minute walkthrough.
          </h2>
          <p className="mt-4 text-base text-[#0E1B2A]/70">
            From a staff member submitting a shift report on their phone, through the
            operator approving it, all the way to the owner&apos;s portfolio dashboard.
          </p>
        </div>

        <div className="relative mt-10 aspect-video overflow-hidden rounded-2xl border border-[#0E1B2A]/10 bg-[#0E1B2A] shadow-2xl">
          {/* Placeholder thumbnail — swap for actual video embed when ready */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://images.unsplash.com/photo-1585740452884-2a29a1d21514?w=1400&q=80&auto=format&fit=crop"
            alt="FOPS product walkthrough"
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-t from-[#0E1B2A]/60 via-transparent to-transparent">
            <button
              type="button"
              aria-label="Play product walkthrough"
              className="flex h-20 w-20 items-center justify-center rounded-full bg-white/95 text-teal-700 shadow-2xl transition hover:scale-105"
            >
              <PlayCircle className="h-12 w-12" />
            </button>
            <p className="mt-2 text-sm font-medium text-white">FOPS in 2 minutes</p>
            <p className="text-xs text-white/70">Video coming soon — start a trial or explore the demo for now</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  SOCIAL PROOF / TESTIMONIALS                                 */
/* ============================================================ */
function SocialProof() {
  const quotes = [
    {
      quote: "We used to chase shift reports in WhatsApp until 9pm every night. With FOPS, my staff submit before they clock off and I see the day's takings from my couch.",
      author: 'Owner, 3-site BP operator',
      location: 'Brisbane, QLD',
    },
    {
      quote: "The banking formula is the killer feature. We used to have a $400 variance every Monday morning — now the system catches it the same shift it happened in.",
      author: 'Operator, multi-site Caltex',
      location: 'Gold Coast, QLD',
    },
    {
      quote: "I'm 22 and I've never used a spreadsheet. I do my shift report on my phone in like a minute and a half.",
      author: 'Staff member, ULP/Diesel site',
      location: 'Toowoomba, QLD',
    },
  ];
  return (
    <section className="bg-[#FAFAF6] py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">What operators say</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0E1B2A] sm:text-4xl">
            From the people running the pumps.
          </h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {quotes.map((q, i) => (
            <figure key={i} className="flex flex-col rounded-xl border border-[#0E1B2A]/10 bg-white p-6 shadow-sm">
              <Quote className="h-6 w-6 text-teal-600/40" />
              <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-[#0E1B2A]/85">
                &ldquo;{q.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-5 border-t border-[#0E1B2A]/10 pt-3">
                <p className="text-sm font-semibold text-[#0E1B2A]">{q.author}</p>
                <p className="text-xs text-[#0E1B2A]/60">
                  <MapPin className="-mt-0.5 mr-0.5 inline h-3 w-3" />
                  {q.location}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  FAQ — pure-CSS accordion via <details>                       */
/* ============================================================ */
function FAQ() {
  const faqs = [
    {
      q: 'How long does it take to onboard a site?',
      a: 'Most sites are live within 48 hours of signup. We import your existing site list, set up your banking formula together, and invite your operators and staff via magic link.',
    },
    {
      q: 'Do my staff need to download anything?',
      a: 'No. FOPS is a web app that runs on any phone browser. Staff bookmark the login page and that\'s it — no app store, no install, no updates.',
    },
    {
      q: 'How is FOPS different from a POS like Z-POS or Allegro?',
      a: 'FOPS is not a POS — it sits on top of your existing POS and till. Think of it as the management layer between your stations and your accountant: shift reports, banking, fuel margin, owner visibility. The POS still rings the tills.',
    },
    {
      q: 'Where is my data stored?',
      a: 'In Sydney (ap-southeast-2). Postgres with row-level security and at-rest encryption. We never share data with other tenants, and you own your data — export it any time.',
    },
    {
      q: 'Can I get my accountant access?',
      a: 'Yes. You can export everything to Excel/PDF, and we have an Operator role you can give to your bookkeeper if they need recurring read-only access to a specific site.',
    },
    {
      q: 'How much does it cost?',
      a: 'Pricing is a flat platform fee plus a small per-site fee, billed monthly in AUD. The 14-day trial lets you try it on your own sites before any charge — start the trial above and the in-app billing page shows your exact total. No lock-in, cancel any time.',
    },
    {
      q: 'Is this just for fuel? What about car wash, café, or shop-only sites?',
      a: 'The shop-sales + banking + drive-offs modules work for any servo, café-attached or not. The wet-stock and margin modules light up if you sell fuel. Shop-only operators get value from the shift-report and banking side.',
    },
  ];
  return (
    <section id="faq" className="bg-white py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">FAQ</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0E1B2A] sm:text-4xl">
            Common questions before you start a trial.
          </h2>
        </div>
        <div className="mt-10 space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group rounded-lg border border-[#0E1B2A]/10 bg-[#FAFAF6] open:bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-[#0E1B2A]">
                {f.q}
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-[#0E1B2A]/10 px-5 py-4 text-sm leading-relaxed text-[#0E1B2A]/75">
                {f.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  FINAL CTA                                                    */
/* ============================================================ */
function FinalCTA() {
  return (
    <section id="contact" className="relative overflow-hidden bg-[#0E1B2A] py-20 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(13,148,136,0.18),_transparent_60%)]" />
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Ready to stop running your servos on WhatsApp?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-white/75">
          Start a 14-day trial on your own sites with your own data. Card on file, charged on day 14 — cancel any time before then with one click.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-500 px-6 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-teal-400"
          >
            Start 14-day trial <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="mailto:hello@fopsapp.com"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-white/30 px-6 py-3 text-base font-semibold text-white transition hover:bg-white/10"
          >
            <Mail className="h-4 w-4" /> Talk to sales
          </a>
        </div>
        <p className="mt-6 text-xs text-white/50">
          Queensland-based · built for Australian fuel operators · ABN coming soon
        </p>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  FOOTER                                                       */
/* ============================================================ */
function Footer() {
  return (
    <footer className="border-t border-[#0E1B2A]/10 bg-[#FAFAF6] py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-600 text-white">
            <Fuel className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-semibold text-[#0E1B2A]">FOPS</span>
          <span className="text-xs text-[#0E1B2A]/50">· Field Operations System</span>
        </div>
        <nav className="flex flex-wrap items-center gap-5 text-xs text-[#0E1B2A]/60">
          <a href="#features" className="hover:text-[#0E1B2A]">Features</a>
          <a href="#how" className="hover:text-[#0E1B2A]">How it works</a>
          <a href="#faq" className="hover:text-[#0E1B2A]">FAQ</a>
          <Link href="/login" className="hover:text-[#0E1B2A]">Log in</Link>
          <Link href="/signup" className="hover:text-[#0E1B2A]">Start trial</Link>
          <a href="mailto:hello@fopsapp.com" className="hover:text-[#0E1B2A]">Contact</a>
        </nav>
        <p className="text-xs text-[#0E1B2A]/40">© {new Date().getFullYear()} FOPS · Queensland, Australia</p>
      </div>
    </footer>
  );
}

/* ============================================================ */
/*  PAGE                                                         */
/* ============================================================ */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF6] text-[#0E1B2A]">
      <Header />
      <main>
        <Hero />
        <TrustStrip />
        <ProblemSection />
        <Features />
        <HierarchySection />
        <DemoVideo />
        <SocialProof />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
