/**
 * scripts/setup-stripe-billing.js
 *
 * Idempotently provisions the Stripe TEST-MODE products + prices that
 * power the per-site billing model:
 *
 *   Product 1: "FOPS Platform Base" — flat $29/month  (one per subscription)
 *   Product 2: "FOPS Per Site"       — flat $29/month × quantity (active sites)
 *
 * The script is safe to re-run: it looks up existing products by metadata
 * tag and updates the unit_amount on the price if it has drifted from the
 * env-configured value (by archiving the old price and creating a new one,
 * since Stripe prices are immutable).
 *
 * On success it PRINTS the env vars to paste into /app/.env:
 *
 *   STRIPE_PRICE_BASE=price_...
 *   STRIPE_PRICE_PER_SITE=price_...
 *
 * The script writes to STRIPE TEST MODE ONLY. It will refuse to run if
 * STRIPE_SECRET_KEY starts with "sk_live_".
 */

const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET) { console.error('STRIPE_SECRET_KEY missing'); process.exit(1); }
if (SECRET.startsWith('sk_live_')) {
  console.error('REFUSING TO RUN — STRIPE_SECRET_KEY is a LIVE key. This script is test-only.');
  process.exit(1);
}

const Stripe = require('stripe');
const stripe = new Stripe(SECRET, { apiVersion: '2024-12-18.acacia' });

// Tunable defaults — all centred in env so re-running with different
// numbers is trivial.
const BASE_AMOUNT       = Number(process.env.BILLING_BASE_AMOUNT_CENTS    || 2900);  // $29.00
const PER_SITE_AMOUNT   = Number(process.env.BILLING_PER_SITE_AMOUNT_CENTS || 2900); // $29.00
const CURRENCY          = (process.env.BILLING_CURRENCY || 'usd').toLowerCase();
const INTERVAL          = 'month';

const MARKER = 'fops_billing_v2'; // metadata.app value used to recognise our products

async function ensureProduct({ name, description, kind }) {
  // List products with our marker; filter in JS (Stripe API doesn't filter by metadata directly).
  const list = await stripe.products.list({ limit: 100, active: true });
  let prod = list.data.find((p) => p.metadata?.app === MARKER && p.metadata?.kind === kind);
  if (!prod) {
    prod = await stripe.products.create({
      name,
      description,
      metadata: { app: MARKER, kind },
    });
    console.log(`✓ Created product ${kind}: ${prod.id}`);
  } else {
    if (prod.name !== name) {
      await stripe.products.update(prod.id, { name, description });
    }
    console.log(`= Product ${kind} already exists: ${prod.id}`);
  }
  return prod;
}

async function ensurePrice(product, unitAmount) {
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  // Look for one matching amount + currency + interval.
  const match = prices.data.find((p) =>
    p.unit_amount === unitAmount && p.currency === CURRENCY &&
    p.recurring?.interval === INTERVAL && p.active
  );
  if (match) {
    console.log(`= Price for ${product.metadata.kind} already at correct amount: ${match.id}  (${unitAmount} ${CURRENCY})`);
    return match;
  }
  // Archive old prices (Stripe prices are immutable; we deactivate and create a new one).
  for (const old of prices.data) {
    if (old.active) {
      await stripe.prices.update(old.id, { active: false });
      console.log(`  · archived old price ${old.id}`);
    }
  }
  const newPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: unitAmount,
    currency: CURRENCY,
    recurring: { interval: INTERVAL },
    metadata: { app: MARKER, kind: product.metadata.kind },
  });
  console.log(`✓ Created price for ${product.metadata.kind}: ${newPrice.id}  (${unitAmount} ${CURRENCY})`);
  return newPrice;
}

async function patchEnvFile(updates) {
  let body = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`^${k}=.*$`, 'm');
    if (re.test(body)) body = body.replace(re, `${k}=${v}`);
    else body += (body.endsWith('\n') ? '' : '\n') + `${k}=${v}\n`;
  }
  fs.writeFileSync(envPath, body);
}

async function main() {
  console.log('Provisioning Stripe TEST-MODE billing artefacts...\n');

  const baseProd = await ensureProduct({
    name: 'FOPS Platform Base',
    description: 'Flat monthly platform fee for the FOPS subscription.',
    kind: 'base',
  });
  const perSiteProd = await ensureProduct({
    name: 'FOPS Per Site',
    description: 'Monthly per-site fee; quantity = number of active sites.',
    kind: 'per_site',
  });

  const basePrice = await ensurePrice(baseProd, BASE_AMOUNT);
  const perSitePrice = await ensurePrice(perSiteProd, PER_SITE_AMOUNT);

  await patchEnvFile({
    STRIPE_PRICE_BASE: basePrice.id,
    STRIPE_PRICE_PER_SITE: perSitePrice.id,
    BILLING_CURRENCY: CURRENCY,
    BILLING_BASE_AMOUNT_CENTS: String(BASE_AMOUNT),
    BILLING_PER_SITE_AMOUNT_CENTS: String(PER_SITE_AMOUNT),
    BILLING_TRIAL_DAYS: String(process.env.BILLING_TRIAL_DAYS || 14),
    BILLING_GRACE_DAYS: String(process.env.BILLING_GRACE_DAYS || 7),
  });

  console.log('\n✓ All set. Env updated. Effective config:');
  console.log(`   STRIPE_PRICE_BASE      = ${basePrice.id}    (${(BASE_AMOUNT/100).toFixed(2)} ${CURRENCY.toUpperCase()}/mo)`);
  console.log(`   STRIPE_PRICE_PER_SITE  = ${perSitePrice.id} (${(PER_SITE_AMOUNT/100).toFixed(2)} ${CURRENCY.toUpperCase()}/site/mo)`);
  console.log(`   trial=${process.env.BILLING_TRIAL_DAYS || 14}d   grace=${process.env.BILLING_GRACE_DAYS || 7}d`);
}

main().catch((e) => { console.error('Setup failed:', e?.message || e); process.exit(1); });
