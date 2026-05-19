/**
 * Brand → visual style map for the QLD Live Prices map.
 *
 * `bg`    — background fill of the pin (the brand's primary colour)
 * `fg`    — text/letter colour painted on top of `bg`
 * `label` — short letter(s) inside the pin (kept to ≤2 chars for legibility
 *           at 28px)
 *
 * Matching is case-insensitive and tolerates the slightly different brand
 * spellings the QLD FPM feed uses (e.g. "7-Eleven" vs "7 Eleven", "Coles
 * Express" vs "Coles", "Caltex/Ampol" hybrids).
 */
export const BRAND_STYLES = {
  // Australian majors
  shell:           { bg: '#FFD500', fg: '#DD1D21', label: 'SH' },
  bp:              { bg: '#009900', fg: '#FFCD00', label: 'BP' },
  'bp - branded':  { bg: '#009900', fg: '#FFCD00', label: 'BP' },
  caltex:          { bg: '#E2231A', fg: '#FFFFFF', label: 'CA' },
  ampol:           { bg: '#003B71', fg: '#FFFFFF', label: 'AM' },
  '7-eleven':      { bg: '#FF7700', fg: '#FFFFFF', label: '7E' },
  '7 eleven':      { bg: '#FF7700', fg: '#FFFFFF', label: '7E' },
  'seven eleven':  { bg: '#FF7700', fg: '#FFFFFF', label: '7E' },
  united:          { bg: '#003DA5', fg: '#FFFFFF', label: 'UN' },
  'united petroleum': { bg: '#003DA5', fg: '#FFFFFF', label: 'UN' },
  'coles express': { bg: '#E01A22', fg: '#FFFFFF', label: 'CX' },
  coles:           { bg: '#E01A22', fg: '#FFFFFF', label: 'CX' },
  mobil:           { bg: '#E20F38', fg: '#FFFFFF', label: 'MB' },
  eg:              { bg: '#003DA5', fg: '#FFD500', label: 'EG' },
  'eg ampol':      { bg: '#003B71', fg: '#FFD500', label: 'EG' },
  liberty:         { bg: '#FFD500', fg: '#1A4FA0', label: 'LB' },
  'metro petroleum': { bg: '#C8102E', fg: '#FFFFFF', label: 'MP' },
  metro:           { bg: '#C8102E', fg: '#FFFFFF', label: 'MP' },
  puma:            { bg: '#E2231A', fg: '#FFD500', label: 'PU' },
  'puma energy':   { bg: '#E2231A', fg: '#FFD500', label: 'PU' },
  astron:          { bg: '#15803D', fg: '#FFFFFF', label: 'AS' },
  vibe:            { bg: '#F97316', fg: '#FFFFFF', label: 'VB' },
  budget:          { bg: '#7C2D12', fg: '#FACC15', label: 'BG' },
  'on the run':    { bg: '#1F2937', fg: '#FBBF24', label: 'OT' },
  otr:             { bg: '#1F2937', fg: '#FBBF24', label: 'OT' },
  costco:          { bg: '#E31837', fg: '#FFFFFF', label: 'CO' },
  woolworths:      { bg: '#0E823A', fg: '#FFFFFF', label: 'WW' },
  'woolworths petrol': { bg: '#0E823A', fg: '#FFFFFF', label: 'WW' },
  fuelxpress:      { bg: '#0EA5E9', fg: '#FFFFFF', label: 'FX' },
  'matilda fuel':  { bg: '#16A34A', fg: '#FFFFFF', label: 'MA' },
  matilda:         { bg: '#16A34A', fg: '#FFFFFF', label: 'MA' },
  pearl:           { bg: '#7C3AED', fg: '#FFFFFF', label: 'PE' },
  freedom:         { bg: '#0EA5E9', fg: '#FFFFFF', label: 'FR' },
  'freedom fuels': { bg: '#0EA5E9', fg: '#FFFFFF', label: 'FR' },
  reddy:           { bg: '#DC2626', fg: '#FFFFFF', label: 'RD' },
  speedway:        { bg: '#DC2626', fg: '#FFFFFF', label: 'SP' },
  'x convenience': { bg: '#0F172A', fg: '#FACC15', label: 'XC' },
};

const DEFAULT_STYLE = { bg: '#6B7280', fg: '#FFFFFF', label: '·' };

/**
 * Resolve the visual style for a brand string from the live feed.
 * Falls back to a neutral grey pin with the first letter of the brand.
 */
export function getBrandStyle(brandRaw) {
  if (!brandRaw) return { ...DEFAULT_STYLE, label: '·' };
  const key = String(brandRaw).trim().toLowerCase();
  if (BRAND_STYLES[key]) return BRAND_STYLES[key];
  // Fuzzy partial match — covers "Shell Coles Express", "BP Travel Centre" etc.
  for (const known of Object.keys(BRAND_STYLES)) {
    if (key.includes(known)) return BRAND_STYLES[known];
  }
  // Final fallback: first 1-2 letters of the brand, neutral grey.
  const letters = key
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase();
  return { ...DEFAULT_STYLE, label: letters || '·' };
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
