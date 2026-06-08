'use client';

/**
 * Public landing page for FOPS.
 *
 * Xero-style marketing page — self-serve SaaS positioning, contact-led
 * pricing, and a clear OWNER → OPERATOR → STAFF hierarchy story.
 *
 * Design tokens (per brief):
 *   bg     warm off-white  #FAFAF6
 *   ink    deep navy        #0E1B2A
 *   teal   primary CTAs     teal-600 → teal-700 (Tailwind scale)
 *   amber  accent (sparing) #F2A33A
 *
 * Notes:
 *   - The floating Help "?" links to the in-page #support anchor. We do NOT
 *     mount the in-app HelpPanel here because it expects an authenticated
 *     user context that public visitors don't have.
 *   - Nav dropdowns are pure-CSS hover menus so we don't pull in a heavier
 *     popover library on a marketing page.
 */

import Link from 'next/link';
import {
  Menu, X, ChevronDown, ArrowRight, Check, Fuel, LineChart,
  ClipboardList, Calculator, HelpCircle, Building2, Users, ClipboardCheck,
  Sparkles, Mail,
} from 'lucide-react';
import { useState } from 'react';

const TEAL = '#0d9488'; // Tailwind teal-600
const TEAL_DARK = '#0f766e'; // Tailwind teal-700
const INK = '#0E1B2A';
const BG = '#FAFAF6';
const AMBER = '#F2A33A';

const PRIMARY_CTA_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md ' +
  'bg-gradient-to-br from-teal-600 to-teal-700 hover:brightness-110';

const SECONDARY_CTA_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition ' +
  'border border-[#0E1B2A]/15 text-[#0E1B2A] hover:bg-[#0E1B2A]/5';

/* ============================================================ */
/*  HEADER                                                      */
/* ============================================================ */
function NavItem({ label, items, href }) {
  if (href) {
    return (
      <Link
        href={href}
        className="text-sm font-medium text-[#0E1B2A]/80 hover:text-[#0E1B2A] transition-colors"
      >
        {label}
      </Link>
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
            <Link
              key={it.label}
              href={it.href || '#'}
              className="block rounded px-3 py-2 text-sm text-[#0E1B2A]/80 hover:bg-[#FAFAF6] hover:text-[#0E1B2A]"
            >
              {it.label}
            </Link>
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
      { label: 'Shift reporting', href: '#features' },
      { label: 'Multi-site dashboard', href: '#features' },
      { label: 'Banking & calculations', href: '#features' },
      { label: 'Fuel price intelligence', href: '#features' },
    ]},
    { label: 'Pricing', href: '#pricing' },
    { label: 'For operators', items: [
      { label: 'How it works', href: '#how' },
      { label: 'Shift reports', href: '#features' },
      { label: 'Banking submissions', href: '#features' },
    ]},
    { label: 'Support', items: [
      { label: 'Contact us', href: '#support' },
      { label: 'Talk to sales', href: '#support' },
    ]},
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[#0E1B2A]/10 bg-[#FAFAF6]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-teal-600 to-teal-700 text-white">
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
            Try FOPS free <ArrowRight className="h-4 w-4" />
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
              <Link
                key={n.label}
                href={n.href || (n.items && n.items[0]?.href) || '#'}
                className="block rounded px-3 py-2 text-sm font-medium text-[#0E1B2A]/85 hover:bg-[#FAFAF6]"
                onClick={() => setMobileOpen(false)}
              >
                {n.label}
              </Link>
            ))}
            <div className="flex gap-2 pt-2">
              <Link href="/login" className={`${SECONDARY_CTA_CLASS} flex-1`}>Log in</Link>
              <Link href="/signup" className={`${PRIMARY_CTA_CLASS} flex-1`}>Try FOPS free</Link>
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
      {/* subtle off-white → white sheen */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(15,158,158,0.06),_transparent_60%)]" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0E1B2A]/10 bg-white/60 px-3 py-1 text-xs font-medium text-[#0E1B2A]/70">
            <Sparkles className="h-3 w-3 text-teal-600" />
            For multi-site fuel retailers
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-[#0E1B2A] sm:text-5xl lg:text-6xl">
            Run every site<br />from <span className="text-teal-700">one place.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#0E1B2A]/75">
            FOPS replaces the WhatsApp chaos with structured daily shift reports,
            automated banking, and live fuel-price intelligence &mdash; across all
            your stations, with the right people seeing the right data.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/signup" className={PRIMARY_CTA_CLASS}>
              Try FOPS free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/login" className={SECONDARY_CTA_CLASS}>Log in</Link>
          </div>
          <p className="mt-3 text-xs text-[#0E1B2A]/55">No card required &middot; Set up your first site in minutes</p>
        </div>

        {/* Dashboard mock */}
        <DashboardMock />
      </div>
    </section>
  );
}

function DashboardMock() {
  const stats = [
    { label: 'Sites', value: '12' },
    { label: 'Today’s reports', value: '34' },
    { label: 'Variance', value: '$420' },
    { label: 'Alerts', value: '2' },
  ];
  const bars = [40, 65, 50, 80, 60, 90, 70, 95, 75];
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-[linear-gradient(135deg,rgba(15,158,158,0.18),rgba(242,163,58,0.10))] blur-xl" />
      <div className="rounded-2xl border border-[#0E1B2A]/10 bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#0E1B2A]/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-teal-600 to-teal-700 text-white">
              <Fuel className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold text-[#0E1B2A]">Owner dashboard</span>
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-teal-600">Live</span>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-[#FAFAF6] p-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-[#0E1B2A]/55">{s.label}</div>
              <div className="mt-1 text-lg font-semibold text-[#0E1B2A]">{s.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-lg border border-[#0E1B2A]/8 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#0E1B2A]/70">Daily revenue</span>
            <span className="text-[10px] text-[#0E1B2A]/45">last 9 days</span>
          </div>
          <div className="mt-3 flex h-24 items-end gap-1.5">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t"
                style={{
                  height: `${h}%`,
                  background: `linear-gradient(180deg, ${TEAL} 0%, ${TEAL_DARK} 100%)`,
                  opacity: i === bars.length - 1 ? 1 : 0.55,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*  HOW IT WORKS                                                 */
/* ============================================================ */
function HowItWorks() {
  const steps = [
    { n: '01', role: 'Owner', icon: Building2, title: 'Sign up & add sites',
      body: 'Create your account in under a minute and add each site you run. You stay in control of who has access.' },
    { n: '02', role: 'Operator', icon: Users, title: 'Owner invites operators',
      body: 'Bring in the operator who runs the day-to-day at each site. They only see and act on the sites you assign.' },
    { n: '03', role: 'Staff', icon: ClipboardCheck, title: 'Operators invite staff',
      body: 'Site staff submit shift reports, banking and dip readings. Numbers roll up automatically for the operator and owner.' },
  ];
  return (
    <section id="how" className="border-t border-[#0E1B2A]/10 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-[#0E1B2A] sm:text-4xl">
            Your team, set up in three steps.
          </h2>
          <p className="mt-3 text-[#0E1B2A]/70">
            Access cascades down the hierarchy. Everyone sees only the sites that
            matter to them.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.n} className="relative rounded-2xl border border-[#0E1B2A]/10 bg-[#FAFAF6] p-6">
                <span className="text-xs font-semibold tracking-wider text-teal-600">{s.n} · {s.role.toUpperCase()}</span>
                <div className="mt-3 flex h-10 w-10 items-center justify-center rounded-md bg-white text-teal-600 shadow-sm">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#0E1B2A]">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#0E1B2A]/70">{s.body}</p>
              </div>
            );
          })}
        </div>

        {/* Flow rail */}
        <div className="mt-10 overflow-hidden rounded-xl border border-[#0E1B2A]/10 bg-white p-4">
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium text-[#0E1B2A]/75 sm:text-sm">
            <span className="rounded-full bg-teal-600/10 px-3 py-1.5 text-teal-700">Owner</span>
            <ArrowRight className="h-3.5 w-3.5 text-[#0E1B2A]/45" />
            <span className="text-[#0E1B2A]/55">invites</span>
            <span className="rounded-full bg-teal-600/10 px-3 py-1.5 text-teal-700">Operators</span>
            <ArrowRight className="h-3.5 w-3.5 text-[#0E1B2A]/45" />
            <span className="text-[#0E1B2A]/55">invite</span>
            <span className="rounded-full bg-teal-600/10 px-3 py-1.5 text-teal-700">Staff</span>
            <ArrowRight className="h-3.5 w-3.5 text-[#0E1B2A]/45" />
            <span className="text-[#0E1B2A]/55">reports flow</span>
            <span className="rounded-full bg-[#F2A33A]/15 px-3 py-1.5 text-[#0E1B2A]">up</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  FEATURES                                                     */
/* ============================================================ */
function Features() {
  const items = [
    { icon: ClipboardList, title: 'Shift reporting',
      body: 'Mobile-first daily reports with live validation, autosave, and a guided wizard.' },
    { icon: LineChart, title: 'Multi-site dashboard',
      body: "One health strip across every site \u2014 who's reported, what's pending, where the variances are." },
    { icon: Calculator, title: 'Banking & calculations',
      body: 'Per-site banking formulas calculate and reconcile automatically, with daily rollups.' },
    { icon: Fuel, title: 'Fuel price intelligence',
      body: 'Live competitor pricing on a map, plus a morning price brief to start the day informed.' },
  ];
  return (
    <section id="features" className="border-t border-[#0E1B2A]/10 bg-[#FAFAF6]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-[#0E1B2A] sm:text-4xl">
            Everything a multi-site operator needs.
          </h2>
          <p className="mt-3 text-[#0E1B2A]/70">
            The four jobs you spend most of your week on &mdash; in one place.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="rounded-2xl border border-[#0E1B2A]/10 bg-white p-6 transition hover:-translate-y-1 hover:shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-600/10 text-teal-700">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-[#0E1B2A]">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#0E1B2A]/70">{f.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  PRICING (contact-led, no $ amounts, no tiers)                */
/* ============================================================ */
function Pricing() {
  const bullets = [
    'Tailored to the number of sites you run',
    'All features included — no surprise add-ons',
    'Onboarding and migration support from a human',
  ];
  return (
    <section id="pricing" className="border-t border-[#0E1B2A]/10 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-[#0E1B2A] sm:text-4xl">
              Pricing that fits your operation.
            </h2>
            <p className="mt-4 text-[#0E1B2A]/75">
              Every operator runs differently — single-site to multi-state portfolios.
              Let&apos;s talk about what you need and we’ll put together a plan that
              works for your business.
            </p>
            <ul className="mt-6 space-y-2.5">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm text-[#0E1B2A]/80">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          <div id="support" className="rounded-2xl border border-[#0E1B2A]/10 bg-[#FAFAF6] p-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-600/10 text-teal-700">
              <Mail className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-xl font-semibold text-[#0E1B2A]">Contact us</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#0E1B2A]/70">
              Tell us a bit about your operation and one of the team will reply with a
              proposal and a walk-through within one business day.
            </p>
            <a
              href="mailto:hello@workflowlite.app?subject=FOPS%20pricing%20enquiry"
              className={`mt-5 w-full ${PRIMARY_CTA_CLASS}`}
            >
              Contact us <ArrowRight className="h-4 w-4" />
            </a>
            <p className="mt-3 text-center text-[11px] text-[#0E1B2A]/55">
              Or try the product first — <Link href="/signup" className="font-semibold text-teal-700 hover:underline">create an owner account</Link>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  DARK CTA BAND                                                */
/* ============================================================ */
function CtaBand() {
  return (
    <section className="bg-[#0E1B2A] text-white">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Ready to retire the WhatsApp group?</h2>
          <p className="mt-3 text-white/70">
            Start with a free owner account, add a site and invite an operator in under
            five minutes. No card. No commitment.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-md bg-gradient-to-br from-teal-600 to-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            Try FOPS free <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#support"
            className="inline-flex items-center gap-2 rounded-md border border-white/20 px-5 py-2.5 text-sm font-semibold text-white/90 transition hover:bg-white/10"
          >
            Talk to us
          </a>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/*  FOOTER                                                       */
/* ============================================================ */
function Footer() {
  const cols = [
    { title: 'Product', items: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'How it works', href: '#how' },
    ]},
    { title: 'Support', items: [
      { label: 'Help centre', href: '#support' },
      { label: 'Contact us', href: '#support' },
      { label: 'System status', href: '#support' },
    ]},
    { title: 'Get started', items: [
      { label: 'Sign up as owner', href: '/signup' },
      { label: 'Log in', href: '/login' },
    ]},
  ];
  return (
    <footer className="border-t border-[#0E1B2A]/10 bg-[#FAFAF6]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-teal-600 to-teal-700 text-white">
                <Fuel className="h-4 w-4" />
              </span>
              <span className="text-base font-semibold tracking-tight text-[#0E1B2A]">FOPS</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#0E1B2A]/65">
              Field Operations System for multi-site fuel operators. Made in Queensland.
            </p>
          </div>
          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#0E1B2A]/60">{col.title}</h4>
              <ul className="mt-3 space-y-2">
                {col.items.map((it) => (
                  <li key={it.label}>
                    {it.href.startsWith('/') ? (
                      <Link href={it.href} className="text-sm text-[#0E1B2A]/80 hover:text-[#0E1B2A]">{it.label}</Link>
                    ) : (
                      <a href={it.href} className="text-sm text-[#0E1B2A]/80 hover:text-[#0E1B2A]">{it.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-[#0E1B2A]/10 pt-6 sm:flex-row sm:items-center">
          <span className="text-xs text-[#0E1B2A]/55">© {new Date().getFullYear()} FOPS. All rights reserved.</span>
          <span className="text-xs text-[#0E1B2A]/55">Built for independent fuel retailers.</span>
        </div>
      </div>
    </footer>
  );
}

/* ============================================================ */
/*  FLOATING HELP                                                */
/* ============================================================ */
// Public landing only — we do NOT mount the in-app HelpPanel because it
// expects an authenticated user context. Link straight to the in-page
// #support anchor instead.
function FloatingHelp() {
  return (
    <a
      href="#support"
      aria-label="Open support"
      className="fixed bottom-5 right-5 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition hover:brightness-110"
      style={{ background: `linear-gradient(135deg, ${TEAL}, ${TEAL_DARK})` }}
    >
      <HelpCircle className="h-5 w-5" />
    </a>
  );
}

/* ============================================================ */
/*  ROOT                                                         */
/* ============================================================ */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF6] text-[#0E1B2A] antialiased">
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Pricing />
        <CtaBand />
      </main>
      <Footer />
      <FloatingHelp />
    </div>
  );
}
