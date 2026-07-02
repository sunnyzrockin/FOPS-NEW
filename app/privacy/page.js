/**
 * /privacy — FOPS privacy policy (public, static).
 *
 * Content authored and approved by owner. Source of truth for the
 * copy is `memory/FOPS_privacy_policy.md`; when that file changes,
 * this page must be updated to match (they're kept in sync manually
 * so we get full styling control without a runtime Markdown parser).
 *
 * Also linked from:
 *   - Landing page footer (components/marketing/landing-page.jsx)
 *   - Waitlist form's collection notice
 *
 * Effective date: 2 July 2026
 */
import Link from 'next/link';
import { Fuel, Mail, ArrowLeft } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy · FOPS',
  description:
    'How FOPS (New Elite Ventures Pty Ltd) collects, uses, and protects your personal information under the Privacy Act 1988 (Cth) and the Australian Privacy Principles.',
};

const SECTIONS = [
  { id: 'what-we-collect', title: '1. What we collect' },
  { id: 'why', title: '2. Why we collect it' },
  { id: 'how-we-use', title: '3. How we use your information' },
  { id: 'sharing', title: '4. Who we share it with' },
  { id: 'storage', title: '5. Where we store it' },
  { id: 'security', title: '6. Security' },
  { id: 'retention', title: '7. How long we keep it' },
  { id: 'your-rights', title: '8. Your rights' },
  { id: 'children', title: '9. Children' },
  { id: 'cookies', title: '10. Cookies and analytics' },
  { id: 'complaints', title: '11. Complaints' },
  { id: 'changes', title: '12. Changes to this policy' },
  { id: 'contact', title: '13. Contact us' },
];

function H2({ id, children }) {
  return (
    <h2 id={id} className="scroll-mt-24 mt-12 text-2xl font-bold text-[#0E1B2A] first:mt-0">
      {children}
    </h2>
  );
}
function P({ children }) {
  return <p className="mt-4 text-[#0E1B2A]/80 leading-relaxed">{children}</p>;
}
function UL({ children }) {
  return <ul className="mt-3 ml-5 space-y-1.5 list-disc text-[#0E1B2A]/80">{children}</ul>;
}
function Strong({ children }) {
  return <strong className="font-semibold text-[#0E1B2A]">{children}</strong>;
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-[#0E1B2A]">
      {/* Header */}
      <header className="border-b border-[#0E1B2A]/10 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2.5 text-[#0E1B2A]">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-600 text-white">
              <Fuel className="h-4 w-4" />
            </span>
            <span className="text-base font-semibold">FOPS</span>
          </Link>
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 text-sm text-[#0E1B2A]/70 hover:text-[#0E1B2A]"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
        <p className="text-sm font-medium uppercase tracking-wider text-teal-700">Legal</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Privacy Policy</h1>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[#0E1B2A]/60">
          <span><Strong>Effective date:</Strong> 2 July 2026</span>
          <span><Strong>Last updated:</Strong> 2 July 2026</span>
        </div>

        <P>
          FOPS (<Strong>&ldquo;we&rdquo;</Strong>, <Strong>&ldquo;us&rdquo;</Strong>, <Strong>&ldquo;our&rdquo;</Strong>) is operated by <Strong>New Elite Ventures Pty Ltd</Strong> (ABN <Strong>96 678 447 384</Strong>). We&apos;re committed to protecting your privacy and handling your personal information in line with the <Strong>Privacy Act 1988 (Cth)</Strong> and the <Strong>Australian Privacy Principles (APPs)</Strong>.
        </P>
        <P>
          This policy explains what we collect, why, how we handle it, and your rights. It covers both our website/waitlist (<Strong>fopsapp.com</Strong>) and the FOPS application.
        </P>

        {/* Table of contents */}
        <nav aria-label="On this page" className="mt-10 rounded-lg border border-[#0E1B2A]/10 bg-[#FAFAF6] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#0E1B2A]/70">On this page</p>
          <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-teal-700 hover:underline">{s.title}</a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Sections */}
        <article className="mt-12">
          <H2 id="what-we-collect">1. What we collect</H2>
          <P><Strong>If you join our waitlist:</Strong></P>
          <UL>
            <li>Your email address (required)</li>
            <li>Optionally, your name and business details (e.g. number of sites)</li>
          </UL>
          <P><Strong>If you use the FOPS application (e.g. as a beta tester):</Strong></P>
          <UL>
            <li>Account information — name, email, and your role (owner, operator, or staff)</li>
            <li>Business operational data you enter — site details, shift reports, banking and sales figures, fuel stock and tank readings, fuel prices</li>
            <li>Usage data — logins, IP address, timestamps, and technical logs for security and reliability</li>
            <li>Payment information — handled directly by <Strong>Stripe</Strong>; we do not store your card details</li>
          </UL>

          <H2 id="why">2. Why we collect it</H2>
          <P>We only collect what we need to:</P>
          <UL>
            <li>Contact you about waitlist status and early access</li>
            <li>Provide and improve the FOPS app</li>
            <li>Process payments (via Stripe) for subscribed users</li>
            <li>Keep the service secure and comply with legal obligations</li>
          </UL>

          <H2 id="how-we-use">3. How we use your information</H2>
          <UL>
            <li>To send account-related and product updates (never marketing without your consent)</li>
            <li>To operate, maintain, and improve the FOPS app</li>
            <li>To detect and prevent fraud or abuse</li>
            <li>To comply with tax, legal, and regulatory requirements</li>
          </UL>

          <H2 id="sharing">4. Who we share it with</H2>
          <P>We share your data only with trusted service providers who help us run FOPS. These include:</P>
          <UL>
            <li><Strong>Supabase</Strong> — hosts our database and authentication</li>
            <li><Strong>Stripe</Strong> — processes payments and subscriptions</li>
            <li><Strong>Emergent Labs</Strong> — hosts our application (deployment platform)</li>
            <li><Strong>Sentry</Strong> — records anonymised error and performance data to help us fix issues</li>
          </UL>
          <P>We don&apos;t sell your data or share it for advertising.</P>

          <H2 id="storage">5. Where we store it</H2>
          <P>
            Your data is stored on secure cloud servers operated by our sub-processors, some of which host data outside Australia (for example, in the United States or Europe). By using FOPS, you consent to this transfer for the purpose of providing the service. We take reasonable steps to ensure your data is protected under equivalent privacy standards.
          </P>

          <H2 id="security">6. Security</H2>
          <P>We use industry-standard measures to protect your data, including:</P>
          <UL>
            <li>Encryption in transit (HTTPS) and at rest</li>
            <li>Role-based access control and least-privilege permissions</li>
            <li>Regular monitoring and system reviews</li>
          </UL>
          <P>No system is 100% secure, but we work hard to keep your data safe.</P>

          <H2 id="retention">7. How long we keep it</H2>
          <UL>
            <li>Waitlist data is kept until you ask us to delete it or until we decide we no longer need it (usually within 12 months if no follow-up)</li>
            <li>Account and business data is kept while your account is active and for up to 7 years afterwards (as required for tax and audit purposes)</li>
            <li>You can request deletion at any time</li>
          </UL>

          <H2 id="your-rights">8. Your rights</H2>
          <P>You can:</P>
          <UL>
            <li>Request access to your personal data</li>
            <li>Request corrections or deletions</li>
            <li>Withdraw consent to marketing communications</li>
            <li>Ask questions or make a privacy complaint</li>
          </UL>
          <P>
            To do any of the above, email <a href="mailto:privacy@arcera.com.au" className="text-teal-700 hover:underline">privacy@arcera.com.au</a>. We&apos;ll respond within a reasonable timeframe.
          </P>

          <H2 id="children">9. Children</H2>
          <P>FOPS is intended for business users. We don&apos;t knowingly collect information from anyone under 16. If you believe this has happened, please let us know and we&apos;ll delete it.</P>

          <H2 id="cookies">10. Cookies and analytics</H2>
          <P>We use only the essential cookies needed to operate the app and keep you signed in. We don&apos;t currently use analytics or advertising cookies. If that changes, we&apos;ll update this policy.</P>

          <H2 id="complaints">11. Complaints</H2>
          <P>
            If you have a privacy concern, contact us first at <a href="mailto:privacy@arcera.com.au" className="text-teal-700 hover:underline">privacy@arcera.com.au</a> and we&apos;ll work to resolve it. If you&apos;re not satisfied, you can contact the <Strong>Office of the Australian Information Commissioner</Strong> at <a href="https://oaic.gov.au" target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">oaic.gov.au</a>.
          </P>

          <H2 id="changes">12. Changes to this policy</H2>
          <P>We may update this policy from time to time. We&apos;ll post the updated version here with a new &ldquo;last updated&rdquo; date, and notify you of material changes where appropriate.</P>

          <H2 id="contact">13. Contact us</H2>
          <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/50 p-5">
            <p className="font-semibold text-[#0E1B2A]">New Elite Ventures Pty Ltd</p>
            <p className="mt-1 text-sm text-[#0E1B2A]/80">ABN: 96 678 447 384</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm">
              <Mail className="h-4 w-4 text-teal-700" />
              <a href="mailto:privacy@arcera.com.au" className="text-teal-700 hover:underline">privacy@arcera.com.au</a>
            </p>
          </div>
        </article>

        <div className="mt-16 border-t border-[#0E1B2A]/10 pt-6">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-[#0E1B2A]/70 hover:text-[#0E1B2A]">
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
