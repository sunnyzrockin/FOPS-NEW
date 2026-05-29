/**
 * lib/help-content.js
 *
 * Source of truth for the in-app Help Panel (Section D). Three exports:
 *
 *   - FAQ_BY_ROLE: role-keyed array of { q, a } pairs. The Help tab shows
 *     the entries for the current user's role plus the COMMON list.
 *   - CHANGELOG: hand-curated reverse-chronological release notes shown
 *     on the "What's New" tab. Keep entries short and human; the most
 *     recent entry is the headline shown when the panel opens.
 *   - FIELD_HELP: short hover/click-popover strings for fields scattered
 *     around the app. Keyed by a stable identifier (eg. "shift.opening_cash")
 *     so individual forms can opt in with <FieldTooltip id="shift.opening_cash" />.
 *
 * Why colocate all three?  All three live and die together when we ship a
 * UI change — a new feature ships with new FAQs, a changelog line, and
 * tooltips for the new fields it added. Splitting them across files just
 * adds friction.
 */

// ============================================================
//  FAQs
// ============================================================

const COMMON_FAQ = [
  {
    q: 'How do I change my password?',
    a: 'Click your name in the top bar (or use the Logout button menu on mobile) and choose "Account settings". You can update your password from there. If you\'ve forgotten the current one, use "Forgot password" on the login page instead.',
  },
  {
    q: 'Why was I signed out automatically?',
    a: 'For security, FOPS expires inactive sessions after a few hours. Just sign back in — you won\'t lose any draft work because the shift form auto-saves locally.',
  },
  {
    q: "I can't see something I expected to see.",
    a: 'Most likely a permissions issue. Owners see all sites; Operators only see sites assigned to them; Staff only see the sites they\'ve been added to. Use the Contact tab below to message support if you think the access is wrong.',
  },
];

export const FAQ_BY_ROLE = {
  owner: [
    {
      q: 'How do I assign an operator to a site?',
      a: 'Open Sites from the sidebar, find the site, and click "Assign operator". Select from existing operators or invite a new one by email. Removing access also notifies the operator by email.',
    },
    {
      q: 'Where do I see banking submissions from all my sites?',
      a: 'Sidebar → Banking Submissions. You can filter by site, status (pending / approved / variance), or date range. Click any row to see the full shift breakdown.',
    },
    {
      q: 'How are variance and health-strip metrics calculated?',
      a: 'Variance is (banked − expected) per shift, aggregated daily. The health strip on your dashboard shows the rolling 7-day variance, pending submissions count, and open price alerts.',
    },
    {
      q: 'Can I export reports to Excel?',
      a: 'Yes — Monthly Reports has a "Download CSV" button, and any pivot view can be exported the same way.',
    },
    ...COMMON_FAQ,
  ],
  operator: [
    {
      q: 'How do I invite a new staff member?',
      a: 'Sidebar → Staff Management → "Invite by email" tab. Enter their email and which sites they should have access to. They\'ll get a magic-link email and can set their own password.',
    },
    {
      q: "A staff member said they didn't receive their invite email.",
      a: "Ask them to check spam first. If it's still missing, go to Staff Management → Pending Invites and use the \"Copy link\" button — you can DM the link directly. Invites expire after 7 days; you can also re-send.",
    },
    {
      q: 'How do I approve a shift report?',
      a: 'Sidebar → Banking Submissions. Pending reports are at the top. Click one to review the breakdown; use "Approve" or "Request changes" with a note for the staff member.',
    },
    {
      q: 'How do I update fuel prices?',
      a: 'Sidebar → Fuel Pricing. Set the new board price per grade and click Save. Staff at that site will see the update on their next shift form load.',
    },
    ...COMMON_FAQ,
  ],
  staff: [
    {
      q: 'My shift form is empty when I come back later.',
      a: "It shouldn't be — the form auto-saves every keystroke to this device. If you switched devices or cleared site data, the draft won't follow you. Always submit from the same device you started on.",
    },
    {
      q: 'Can I type math like 2450+1360 in a number field?',
      a: 'Yes — numeric fields accept Excel-style formulas. "+2450+1360", "(800+200)*1.1", and "1,234.50 - 500" all work. The result is calculated when you tab away from the field.',
    },
    {
      q: 'I submitted but my operator says it never arrived.',
      a: 'Open "My Reports" — if you see your shift listed, it submitted. If it shows "Draft" you never tapped Submit. If you see it but your operator doesn\'t, message them via the Contact tab below.',
    },
    {
      q: 'How do I correct a mistake on a submitted report?',
      a: 'Tap the report in "My Reports" and ask your operator to send it back for changes. You can\'t edit a submitted report directly — this keeps the audit trail clean.',
    },
    ...COMMON_FAQ,
  ],
};

// ============================================================
//  Changelog (newest first)
// ============================================================

export const CHANGELOG = [
  {
    date: '2026-05-29',
    title: 'In-app help is here',
    body:
      'Click the floating "?" any time to get role-specific FAQs, see what\'s new, or contact support without leaving the app.',
    tags: ['help', 'support'],
  },
  {
    date: '2026-05-27',
    title: 'Welcome tour for new users',
    body:
      'First-time logins now get a 3-step orientation tailored to their role. Existing users won\'t see this — it\'s only for fresh accounts and accepted invites.',
    tags: ['onboarding'],
  },
  {
    date: '2026-05-24',
    title: 'Magic-link invites',
    body:
      'Operators can now invite staff by email. The new team member gets a secure link, sets their own password, and lands on their dashboard — no shared credentials.',
    tags: ['staff', 'security'],
  },
  {
    date: '2026-05-20',
    title: 'Operator unassignment notifications',
    body:
      'When an Owner removes operator access to a site, the operator now receives an automated email so they know what changed and when.',
    tags: ['notifications'],
  },
  {
    date: '2026-05-15',
    title: 'New left sidebar',
    body:
      'Owner and Operator dashboards now use a left sidebar grouped by Overview / Operations / Fuel / Finance / Config. The sidebar collapses for more screen real estate and remembers your preference per device.',
    tags: ['ui'],
  },
  {
    date: '2026-05-10',
    title: 'Excel-style formulas in shift fields',
    body:
      'Numeric fields on the shift report now accept arithmetic. Type "+2450+1360" or "(800+200)*1.1" and the value is calculated on blur — no separate calculator needed.',
    tags: ['shift-form'],
  },
];

// ============================================================
//  Field-level tooltips
// ============================================================

export const FIELD_HELP = {
  // Shift report
  'shift.opening_cash':
    'Cash already in the till at the start of your shift, before any sales. Count the float — coins included.',
  'shift.closing_cash':
    'Total cash in the till at end of shift, before any banking. Includes the float you started with.',
  'shift.fuel_volume':
    'Total litres dispensed during your shift, taken from the pump totaliser readings. Accepts arithmetic like "+2450+1360".',
  'shift.eftpos_total':
    'End-of-shift EFTPOS settlement total. Don\'t enter individual transactions — just the closing batch number.',
  'shift.dip_litres':
    'Optional. End-of-shift tank dip reading in litres. Used to reconcile pump dispensing against tank movement.',

  // Banking / formulas
  'banking.expected':
    'Calculated automatically from your configured formula. Hover the formula icon next to it to see the inputs.',
  'banking.variance':
    'Banked amount minus expected. Negative means short, positive means over.',

  // Site config
  'site.fuel_grades':
    'Pick the fuel grades sold at this site (E10, ULP, Premium, Diesel etc.). Only selected grades will appear on shift forms for staff here.',
  'site.timezone':
    'Used to bucket shift submissions into the correct "day" for daily rollups. Defaults to AEST if not set.',

  // Invites
  'invite.expires':
    'Magic links are valid for 7 days from when they\'re sent. After that you\'ll need to issue a new invite.',
  'invite.role':
    'The role the new user will have once they accept. Operators can only invite Staff; Owners can invite Operators or Staff.',
};

export function helpFor(id) {
  return FIELD_HELP[id] || null;
}
