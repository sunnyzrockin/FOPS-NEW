// QldFpmProvider — real provider that talks to the Queensland Fuel Price
// Mandatory (FPM) Direct API. Activated when both:
//   process.env.FUEL_PROVIDER === 'qld_fpm'
//   process.env.FUEL_PRICES_QLD_SUBSCRIBER_TOKEN is set
//
// Auth header format mandated by QLD FPM:
//   Authorization: FPDAPI SubscriberToken=<token>
//
// API base URL: https://fppdirectapi-prod.fuelpricesqld.com.au
// Endpoints used:
//   GET /Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=3&geoRegionId=1
//      → returns all sites in QLD (geoRegionLevel=3 == state-level).
//   GET /Price/GetSitesPrices?countryId=21&geoRegionLevel=3&geoRegionId=1
//      → returns current prices for all those sites.
//
// QLD FPM FuelId mapping (per their docs; verify in your welcome email):
const QLD_FUEL_ID_MAP = {
  2:  'ULP91',
  3:  'PULP',     // we map PULP→U95 below for display
  4:  'Diesel',
  5:  'LPG',
  6:  'PDL',
  7:  'E10',
  8:  'U98',
  10: 'U95',      // alt PULP code seen in some payloads
};

// Some integrations call "U95" "PULP". Normalise to our canonical short
// names.
function normaliseFuel(raw) {
  if (raw === 'PULP') return 'U95';
  return raw;
}

// We attempt a region lookup using the station's address. QLD FPM does
// return a region name in GetFullSiteDetails when geoRegionLevel=3, but
// the field name has historically varied. We fall back to nearest
// anchor for safety.
const REGION_ANCHORS = [
  { name: 'Brisbane',       lat: -27.4705, lng: 153.0268 },
  { name: 'Gold Coast',     lat: -28.0028, lng: 153.4314 },
  { name: 'Sunshine Coast', lat: -26.7964, lng: 153.0966 },
  { name: 'Toowoomba',      lat: -27.5598, lng: 151.9507 },
  { name: 'Cairns',         lat: -16.8766, lng: 145.7781 },
  { name: 'Townsville',     lat: -19.2589, lng: 146.8169 },
  { name: 'Mackay',         lat: -21.1421, lng: 149.1865 },
  { name: 'Rockhampton',    lat: -23.3781, lng: 150.5100 },
  { name: 'Bundaberg',      lat: -24.8661, lng: 152.3489 },
  { name: 'Hervey Bay',     lat: -25.2882, lng: 152.8203 },
];

function nearestRegion(lat, lng) {
  let best = REGION_ANCHORS[0];
  let bestD = Infinity;
  for (const r of REGION_ANCHORS) {
    const dLat = r.lat - lat;
    const dLng = r.lng - lng;
    const d2 = dLat * dLat + dLng * dLng;
    if (d2 < bestD) { bestD = d2; best = r; }
  }
  return best.name;
}

const QLD_BASE = 'https://fppdirectapi-prod.fuelpricesqld.com.au';
const TIMEOUT_MS = parseInt(process.env.FUEL_PRICE_FETCH_TIMEOUT_MS || '15000', 10);

export class QldFpmProvider {
  constructor() {
    this.label = 'qld_fpm';
    this.token = process.env.FUEL_PRICES_QLD_SUBSCRIBER_TOKEN;
    if (!this.token) {
      throw new Error('FUEL_PRICES_QLD_SUBSCRIBER_TOKEN env var is missing');
    }
  }

  async _fetch(path) {
    const url = `${QLD_BASE}${path}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `FPDAPI SubscriberToken=${this.token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`QLD FPM ${path} → HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  async fetchSnapshot() {
    // QLD region IDs: countryId=21 (Australia), geoRegionLevel=3, geoRegionId=1 == Queensland state.
    // (Verify against your provider welcome email; some accounts use
    // geoRegionLevel=2 with a different geoRegionId per metro region.)
    const sitesPath  = '/Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=3&geoRegionId=1';
    const pricesPath = '/Price/GetSitesPrices?countryId=21&geoRegionLevel=3&geoRegionId=1';

    const [sitesData, pricesData] = await Promise.all([
      this._fetch(sitesPath),
      this._fetch(pricesPath),
    ]);

    const sitesArr  = sitesData?.S || sitesData?.Sites || [];
    const pricesArr = pricesData?.SitePrices || pricesData?.SP || [];

    const stations = sitesArr.map((s) => {
      const lat = Number(s.Lat ?? s.Latitude);
      const lng = Number(s.Lng ?? s.Longitude);
      return {
        station_id: String(s.S ?? s.SiteId ?? s.Id),
        name: s.N ?? s.SiteName ?? s.Name ?? 'Unnamed station',
        brand: s.B ?? s.BrandName ?? s.Brand ?? null,
        address: [s.A, s.Sub, s.P].filter(Boolean).join(', ') || s.Address || null,
        region: s.Region || s.R || nearestRegion(lat, lng),
        postcode: s.P ? String(s.P) : (s.Postcode ? String(s.Postcode) : null),
        latitude: lat,
        longitude: lng,
        is_open: s.IsOpen !== false,
      };
    });

    const prices = pricesArr.map((p) => {
      const fuelIdNum = Number(p.FuelId ?? p.F);
      const rawFuel   = QLD_FUEL_ID_MAP[fuelIdNum] || `FuelId_${fuelIdNum}`;
      return {
        station_id: String(p.SiteId ?? p.S),
        fuel_type: normaliseFuel(rawFuel),
        // QLD FPM returns Price in tenths-of-a-cent (e.g. 1897 = 189.7c =
        // $1.897). Our DB stores cents (so 1897 here → 189.7 cents → we
        // round to nearest integer cent). We keep one decimal of precision
        // by storing tenths-of-cent in price_cents (multiplied/10 later).
        price_cents: Math.round(Number(p.Price ?? p.P) / 10),
        provider_updated_at: p.LastUpdated || p.U || new Date().toISOString(),
      };
    });

    return { stations, prices, provider_label: this.label };
  }
}
