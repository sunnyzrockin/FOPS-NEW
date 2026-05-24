/**
 * Brand logo SVG library — simplified inline icons for Australian fuel
 * brands. Each entry returns an SVG STRING (24×24 viewBox) so it can be
 * dropped straight into Leaflet's divIcon HTML without needing an asset
 * pipeline. Icons are intentionally minimal/stylised approximations — not
 * trademarked artwork — designed to make brands instantly recognisable in
 * the PetrolSpy-style stacked marker.
 *
 * Usage:
 *   import { getBrandLogoSvg } from '@/lib/fuel-pricing/brand-logos';
 *   const svg = getBrandLogoSvg('shell', '#DD1D21');
 */

// Helper to generate sunburst rays (BP, Caltex-style)
function sunburstRays(color, n = 12) {
  const rays = [];
  for (let i = 0; i < n; i++) {
    const a1 = (i * 360) / n;
    const a2 = a1 + 360 / n / 2;
    const r1 = 11, r2 = 4;
    const p = (a, r) => [
      12 + Math.cos((a - 90) * Math.PI / 180) * r,
      12 + Math.sin((a - 90) * Math.PI / 180) * r,
    ];
    const [x1, y1] = p(a1, r1);
    const [x2, y2] = p(a2, r2);
    rays.push(`${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
  }
  return `<polygon points="${rays.join(' ')}" fill="${color}"/>`;
}

export const BRAND_LOGOS = {
  // BP — green/yellow sunburst (Helios)
  bp: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#009900"/>
      ${sunburstRays('#FFCD00', 16)}
      <circle cx="12" cy="12" r="2.5" fill="#009900"/>
    </svg>`,

  // Shell — scallop shell silhouette
  shell: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="${fg}" d="M12 3c-4.5 0-8 3-8 8 0 4 2 8 3 10h2l-1-9 2 9h2l-.5-10 1.5 10h2l1.5-10-.5 10h2l2-9-1 9h2c1-2 3-6 3-10 0-5-3.5-8-8-8z"/>
    </svg>`,

  // Caltex — red star with blue band (caltex chevron-star)
  caltex: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <polygon points="12,2 14.7,9.1 22,9.4 16.2,13.9 18.4,21 12,16.8 5.6,21 7.8,13.9 2,9.4 9.3,9.1" fill="${fg}"/>
      <rect x="2" y="11" width="20" height="2.6" fill="#003B71"/>
    </svg>`,

  // Ampol — red/blue chevron
  ampol: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#003B71" d="M2 6h20v12H2z"/>
      <path fill="#E2231A" d="M12 4l10 8H2z"/>
      <path fill="#FFFFFF" d="M12 8l6 6H6z"/>
    </svg>`,

  // 7-Eleven — red/orange/green striped "7"
  seven_eleven: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="3" width="20" height="6" fill="#E2231A"/>
      <rect x="2" y="9"  width="20" height="6" fill="#FF7700"/>
      <rect x="2" y="15" width="20" height="6" fill="#008542"/>
      <text x="12" y="17" font-family="Impact, Arial Black, sans-serif" font-size="18"
        font-weight="900" fill="#FFFFFF" text-anchor="middle">7</text>
    </svg>`,

  // United Petroleum — red triangle pointing right + blue triangle
  united: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#FFFFFF"/>
      <polygon points="3,4 14,12 3,20" fill="#E2231A"/>
      <polygon points="21,4 10,12 21,20" fill="#003DA5"/>
    </svg>`,

  // Mobil — red O with text approximation
  mobil: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" fill="#FFFFFF" stroke="#003B71" stroke-width="2"/>
      <text x="12" y="16" font-family="Arial Black, sans-serif" font-size="12"
        font-weight="900" fill="#E20F38" text-anchor="middle">o</text>
    </svg>`,

  // Coles Express — red "C"
  coles: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#E01A22"/>
      <text x="12" y="17" font-family="Arial Black, sans-serif" font-size="16"
        font-weight="900" fill="#FFD500" text-anchor="middle">c</text>
    </svg>`,

  // EG — circular EG mark
  eg: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#003DA5"/>
      <text x="12" y="16" font-family="Arial Black, sans-serif" font-size="10"
        font-weight="900" fill="#FFD500" text-anchor="middle">EG</text>
    </svg>`,

  // Liberty — torch flame
  liberty: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#FFD500"/>
      <path fill="#1A4FA0" d="M12 3c-1 3-4 4-4 8 0 3 1.8 5 4 5s4-2 4-5c0-4-3-5-4-8z"/>
      <rect x="9" y="16" width="6" height="2" fill="#1A4FA0"/>
      <rect x="10" y="18" width="4" height="3" fill="#1A4FA0"/>
    </svg>`,

  // Metro — bold "M" on red
  metro: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#C8102E"/>
      <text x="12" y="18" font-family="Arial Black, sans-serif" font-size="18"
        font-weight="900" fill="#FFFFFF" text-anchor="middle">M</text>
    </svg>`,

  // Puma — leaping puma silhouette (stylised)
  puma: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#E2231A"/>
      <path fill="#FFD500" d="M2 17c2-1 4-2 6-3 1-2 2-3 4-4 1-1 3-2 5-2 2 0 3 1 3 2 0 1-1 2-2 2 1 1 2 2 2 4 0 1-1 2-2 2-2 0-4-1-5-2-1 1-3 2-5 2-2 0-4 0-6-1z"/>
    </svg>`,

  // Reddy — bold red "R"
  reddy: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#DC2626" rx="2"/>
      <text x="12" y="18" font-family="Arial Black, sans-serif" font-size="18"
        font-weight="900" fill="#FFFFFF" text-anchor="middle">R</text>
    </svg>`,

  // Astron — A on green
  astron: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#15803D"/>
      <text x="12" y="17" font-family="Arial Black, sans-serif" font-size="14"
        font-weight="900" fill="#FFFFFF" text-anchor="middle">A</text>
    </svg>`,

  // Vibe — wave/V on orange
  vibe: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#F97316"/>
      <path fill="#FFFFFF" d="M4 8l4 10h2l4-10h-2l-3 7-3-7zm10 0l4 10h2l-2-10h-4z"/>
    </svg>`,

  // OTR / On The Run — black with yellow OTR
  otr: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#1F2937" rx="3"/>
      <text x="12" y="16" font-family="Arial Black, sans-serif" font-size="9"
        font-weight="900" fill="#FBBF24" text-anchor="middle">OTR</text>
    </svg>`,

  // Costco — red square with C
  costco: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#E31837"/>
      <text x="12" y="18" font-family="Arial Black, sans-serif" font-size="16"
        font-weight="900" fill="#FFFFFF" text-anchor="middle">C</text>
    </svg>`,

  // Woolworths — green W
  woolworths: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#0E823A"/>
      <text x="12" y="17" font-family="Arial Black, sans-serif" font-size="14"
        font-weight="900" fill="#FFFFFF" text-anchor="middle">W</text>
    </svg>`,

  // Freedom Fuels — blue chevron
  freedom: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#FFFFFF"/>
      <polygon points="2,3 14,12 2,21" fill="#0EA5E9"/>
      <text x="17" y="16" font-family="Arial Black, sans-serif" font-size="9"
        font-weight="900" fill="#0EA5E9" text-anchor="middle">F</text>
    </svg>`,

  // Matilda — green M
  matilda: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#16A34A"/>
      <text x="12" y="17" font-family="Arial Black, sans-serif" font-size="14"
        font-weight="900" fill="#FFFFFF" text-anchor="middle">M</text>
    </svg>`,

  // Pearl — purple shell
  pearl: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#7C3AED"/>
      <text x="12" y="17" font-family="Arial Black, sans-serif" font-size="14"
        font-weight="900" fill="#FFFFFF" text-anchor="middle">P</text>
    </svg>`,

  // FuelXpress — sky F
  fuelxpress: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#0EA5E9" rx="3"/>
      <text x="12" y="18" font-family="Arial Black, sans-serif" font-size="16"
        font-weight="900" fill="#FFFFFF" text-anchor="middle">F</text>
    </svg>`,

  // Speedway — red checker S
  speedway: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#DC2626"/>
      <text x="12" y="18" font-family="Arial Black, sans-serif" font-size="16"
        font-weight="900" fill="#FFFFFF" text-anchor="middle">S</text>
    </svg>`,

  // X Convenience — dark X
  x_convenience: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#0F172A"/>
      <text x="12" y="18" font-family="Arial Black, sans-serif" font-size="18"
        font-weight="900" fill="#FACC15" text-anchor="middle">X</text>
    </svg>`,

  // Budget — bronze B
  budget: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#7C2D12" rx="2"/>
      <text x="12" y="18" font-family="Arial Black, sans-serif" font-size="16"
        font-weight="900" fill="#FACC15" text-anchor="middle">B</text>
    </svg>`,

  // Independent / unknown — simple fuel-pump icon
  independent: (fg) => `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" fill="#6B7280" rx="2"/>
      <rect x="6" y="4" width="8" height="14" fill="#FFFFFF" rx="1"/>
      <rect x="7" y="6" width="6" height="4" fill="#6B7280"/>
      <rect x="15" y="7" width="2" height="2" fill="#FFFFFF"/>
      <rect x="16" y="9" width="2" height="6" fill="#FFFFFF"/>
    </svg>`,
};

/**
 * Pick the right logo SVG for a brand key (already-normalised lowercase).
 * Returns null when no specific logo is defined — the caller should then
 * fall back to plain text wordmark in the shield.
 */
export function getBrandLogoSvg(brandKey, fg = '#FFFFFF') {
  if (!brandKey) return null;
  const k = String(brandKey).trim().toLowerCase();
  const map = {
    bp: 'bp',
    'bp - branded': 'bp',
    shell: 'shell',
    caltex: 'caltex',
    ampol: 'ampol',
    '7-eleven': 'seven_eleven',
    '7 eleven': 'seven_eleven',
    'seven eleven': 'seven_eleven',
    united: 'united',
    'united petroleum': 'united',
    mobil: 'mobil',
    coles: 'coles',
    'coles express': 'coles',
    eg: 'eg',
    'eg ampol': 'eg',
    liberty: 'liberty',
    metro: 'metro',
    'metro petroleum': 'metro',
    puma: 'puma',
    'puma energy': 'puma',
    reddy: 'reddy',
    astron: 'astron',
    vibe: 'vibe',
    otr: 'otr',
    'on the run': 'otr',
    costco: 'costco',
    woolworths: 'woolworths',
    'woolworths petrol': 'woolworths',
    freedom: 'freedom',
    'freedom fuels': 'freedom',
    matilda: 'matilda',
    'matilda fuel': 'matilda',
    pearl: 'pearl',
    fuelxpress: 'fuelxpress',
    speedway: 'speedway',
    'x convenience': 'x_convenience',
    budget: 'budget',
  };
  // Try exact match first, then partial contains
  let logoKey = map[k];
  if (!logoKey) {
    for (const known of Object.keys(map)) {
      if (k.includes(known)) { logoKey = map[known]; break; }
    }
  }
  if (!logoKey) return null;
  return BRAND_LOGOS[logoKey](fg);
}

/**
 * Generic placeholder for genuinely unbranded sites.
 */
export function getIndependentLogoSvg() {
  return BRAND_LOGOS.independent();
}
