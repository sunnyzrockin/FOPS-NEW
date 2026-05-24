/**
 * Brand → visual style map for the QLD Live Prices map.
 *
 * Each entry now describes how a "PetrolSpy-style" marker should render:
 *   bg        — background fill of the brand shield (the brand's primary colour)
 *   fg        — text colour on top of `bg`
 *   wordmark  — the display name on the shield (e.g. "Shell", "BP", "AMPOL")
 *   label     — short 2-letter fallback when the wordmark won't fit (legacy)
 *   accent    — optional secondary colour for two-tone shields (e.g. United red/blue)
 *
 * Matching is case-insensitive and tolerates the slightly different brand
 * spellings the QLD FPM feed uses (e.g. "7-Eleven" vs "7 Eleven", "Coles
 * Express" vs "Coles", "Caltex/Ampol" hybrids).
 */
export const BRAND_STYLES = {
  // Australian majors
  shell:           { bg: '#FFD500', fg: '#DD1D21', wordmark: 'Shell',   label: 'SH' },
  bp:              { bg: '#009900', fg: '#FFCD00', wordmark: 'BP',      label: 'BP' },
  'bp - branded':  { bg: '#009900', fg: '#FFCD00', wordmark: 'BP',      label: 'BP' },
  caltex:          { bg: '#E2231A', fg: '#FFFFFF', wordmark: 'Caltex',  label: 'CA' },
  ampol:           { bg: '#003B71', fg: '#FFFFFF', wordmark: 'AMPOL',   label: 'AM', accent: '#E2231A' },
  '7-eleven':      { bg: '#FFFFFF', fg: '#008542', wordmark: 'ELEVEN',  label: '7E', accent: '#E2231A' },
  '7 eleven':      { bg: '#FFFFFF', fg: '#008542', wordmark: 'ELEVEN',  label: '7E', accent: '#E2231A' },
  'seven eleven':  { bg: '#FFFFFF', fg: '#008542', wordmark: 'ELEVEN',  label: '7E', accent: '#E2231A' },
  united:          { bg: '#FFFFFF', fg: '#003DA5', wordmark: 'United',  label: 'UN', accent: '#E2231A' },
  'united petroleum': { bg: '#FFFFFF', fg: '#003DA5', wordmark: 'United', label: 'UN', accent: '#E2231A' },
  'coles express': { bg: '#E01A22', fg: '#FFFFFF', wordmark: 'Coles',   label: 'CX' },
  coles:           { bg: '#E01A22', fg: '#FFFFFF', wordmark: 'Coles',   label: 'CX' },
  mobil:           { bg: '#E20F38', fg: '#FFFFFF', wordmark: 'Mobil',   label: 'MB' },
  eg:              { bg: '#003DA5', fg: '#FFD500', wordmark: 'EG',      label: 'EG' },
  'eg ampol':      { bg: '#003B71', fg: '#FFD500', wordmark: 'EG',      label: 'EG' },
  liberty:         { bg: '#FFD500', fg: '#1A4FA0', wordmark: 'Liberty', label: 'LB' },
  'metro petroleum': { bg: '#C8102E', fg: '#FFFFFF', wordmark: 'Metro', label: 'MP' },
  metro:           { bg: '#C8102E', fg: '#FFFFFF', wordmark: 'Metro',   label: 'MP' },
  puma:            { bg: '#E2231A', fg: '#FFD500', wordmark: 'Puma',    label: 'PU' },
  'puma energy':   { bg: '#E2231A', fg: '#FFD500', wordmark: 'Puma',    label: 'PU' },
  astron:          { bg: '#15803D', fg: '#FFFFFF', wordmark: 'Astron',  label: 'AS' },
  vibe:            { bg: '#F97316', fg: '#FFFFFF', wordmark: 'Vibe',    label: 'VB' },
  budget:          { bg: '#7C2D12', fg: '#FACC15', wordmark: 'Budget',  label: 'BG' },
  'on the run':    { bg: '#1F2937', fg: '#FBBF24', wordmark: 'OTR',     label: 'OT' },
  otr:             { bg: '#1F2937', fg: '#FBBF24', wordmark: 'OTR',     label: 'OT' },
  costco:          { bg: '#E31837', fg: '#FFFFFF', wordmark: 'Costco',  label: 'CO' },
  woolworths:      { bg: '#0E823A', fg: '#FFFFFF', wordmark: 'Woolworths', label: 'WW' },
  'woolworths petrol': { bg: '#0E823A', fg: '#FFFFFF', wordmark: 'Woolworths', label: 'WW' },
  fuelxpress:      { bg: '#0EA5E9', fg: '#FFFFFF', wordmark: 'FuelXpress', label: 'FX' },
  'matilda fuel':  { bg: '#16A34A', fg: '#FFFFFF', wordmark: 'Matilda', label: 'MA' },
  matilda:         { bg: '#16A34A', fg: '#FFFFFF', wordmark: 'Matilda', label: 'MA' },
  pearl:           { bg: '#7C3AED', fg: '#FFFFFF', wordmark: 'Pearl',   label: 'PE' },
  freedom:         { bg: '#0EA5E9', fg: '#FFFFFF', wordmark: 'Freedom', label: 'FR' },
  'freedom fuels': { bg: '#0EA5E9', fg: '#FFFFFF', wordmark: 'Freedom', label: 'FR' },
  reddy:           { bg: '#DC2626', fg: '#FFFFFF', wordmark: 'Reddy',   label: 'RD' },
  speedway:        { bg: '#DC2626', fg: '#FFFFFF', wordmark: 'Speedway', label: 'SP' },
  'x convenience': { bg: '#0F172A', fg: '#FACC15', wordmark: 'X', label: 'XC' },
};

const DEFAULT_STYLE = { bg: '#6B7280', fg: '#FFFFFF', wordmark: 'Indep.', label: '·' };

/**
 * Resolve the visual style for a brand string from the live feed.
 * Falls back to a neutral grey shield labelled "Indep." (independent).
 */
export function getBrandStyle(brandRaw) {
  if (!brandRaw) return { ...DEFAULT_STYLE };
  const key = String(brandRaw).trim().toLowerCase();
  if (BRAND_STYLES[key]) return BRAND_STYLES[key];
  // Fuzzy partial match — covers "Shell Coles Express", "BP Travel Centre" etc.
  for (const known of Object.keys(BRAND_STYLES)) {
    if (key.includes(known)) return BRAND_STYLES[known];
  }
  // Final fallback: title-case the brand string itself (capped at 8 chars)
  const cleaned = String(brandRaw).trim().replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 10);
  const wordmark = cleaned
    ? cleaned.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ').slice(0, 10)
    : 'Indep.';
  const letters = key.replace(/[^a-z0-9]/g, '').slice(0, 2).toUpperCase() || '·';
  return { ...DEFAULT_STYLE, wordmark, label: letters };
}

/**
 * Map a fuel-type code (from QLD FPM) to a short label suitable for the
 * top yellow price tag (e.g. "Prem", "Diesel", "ULP", "E10").
 */
export function getFuelGradeShortLabel(fuelType) {
  if (!fuelType) return '';
  const k = String(fuelType).trim().toLowerCase();
  if (k.includes('e10')) return 'E10';
  if (k.includes('98') || k.includes('premium 98')) return 'P98';
  if (k.includes('95') || k.includes('premium')) return 'Prem';
  if (k.includes('diesel') || k.includes('dsl')) return 'Diesel';
  if (k.includes('lpg') || k.includes('autogas')) return 'LPG';
  if (k.includes('u91') || k.includes('91') || k.includes('ulp')) return 'ULP';
  if (k.includes('ad blue') || k.includes('adblue')) return 'AdBlue';
  // Fallback: first 6 chars title-cased
  return k.charAt(0).toUpperCase() + k.slice(1, 6);
}

/**
 * Price-band → ring colour (matches the existing legend).
 *   cheap   → emerald
 *   mid     → amber
 *   expensive → red
 * Falls back to blue if priceStats is unavailable.
 */
export function getPriceBandColor(priceCents, priceStats) {
  if (!priceStats || priceStats.min === priceStats.max) return '#3b82f6';
  const { min, max } = priceStats;
  const cheapCutoff = min + (max - min) / 3;
  const midCutoff = min + (2 * (max - min)) / 3;
  if (priceCents <= cheapCutoff) return '#10b981';
  if (priceCents <= midCutoff)   return '#f59e0b';
  return '#ef4444';
}
