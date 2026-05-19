// QldFpmProvider — real provider for the Queensland Fuel Price Mandatory
// (FPM) Direct API v1.5. Activated when env FUEL_PROVIDER='qld_fpm' and
// FUEL_PRICES_QLD_SUBSCRIBER_TOKEN is set.
//
// API spec: FuelPricesQLDDirectAPI(OUT)v1.5
//   Base URL: https://fppdirectapi-prod.fuelpricesqld.com.au
//   Auth:    Authorization: FPDAPI SubscriberToken=<token>
//   Rate:    GetSitesPrices ≤ 1/min (our 15-min cache is well under)
//
// Three endpoints we call:
//   GET /Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=3&geoRegionId=1
//   GET /Subscriber/GetCountryBrands?countryId=21      (resolves brand IDs)
//   GET /Price/GetSitesPrices?countryId=21&geoRegionLevel=3&geoRegionId=1
//
// QLD state-wide:  countryId=21 (Australia), geoRegionLevel=3 (states),
//                  geoRegionId=1 (Queensland).
//
// FuelId mapping (per spec page describing GetFuelTypes):
const QLD_FUEL_ID_MAP = {
  2:  'ULP91',      // legacy "Unleaded 91"
  4:  'ULP91',
  5:  'U95',        // Premium Unleaded 95
  6:  'U98',        // Premium Unleaded 98
  7:  'Diesel',
  8:  'Diesel',     // Premium Diesel — bucket together for MVP
  9:  'LPG',
  10: 'E10',
  11: 'E10',        // E85 → bucket as E10 for filter UI (rare)
  12: 'AdBlue',
};

// Price field arrives in TENTHS of a cent.
//   Price=1679  →  $1.679/L
// We store integer cents so 1679 → round(167.9) → 168.
function priceTenthsToCents(p) {
  const n = Number(p);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n / 10);
}

// Regions in the response are integer IDs (G1..G5). For MVP we resolve a
// human-readable region label by snapping each station to the nearest of
// our anchor regions. Good enough for the filter dropdown; can be replaced
// with a proper GetGeographicRegions call later.
const REGION_ANCHORS = [
  { name: 'Brisbane',       lat: -27.4705, lng: 153.0268 },
  { name: 'Gold Coast',     lat: -28.0028, lng: 153.4314 },
  { name: 'Sunshine Coast', lat: -26.7964, lng: 153.0966 },
  { name: 'Toowoomba',      lat: -27.5598, lng: 151.9507 },
  { name: 'Ipswich',        lat: -27.6171, lng: 152.7610 },
  { name: 'Logan',          lat: -27.6390, lng: 153.1093 },
  { name: 'Cairns',         lat: -16.8766, lng: 145.7781 },
  { name: 'Townsville',     lat: -19.2589, lng: 146.8169 },
  { name: 'Mackay',         lat: -21.1421, lng: 149.1865 },
  { name: 'Rockhampton',    lat: -23.3781, lng: 150.5100 },
  { name: 'Bundaberg',      lat: -24.8661, lng: 152.3489 },
  { name: 'Hervey Bay',     lat: -25.2882, lng: 152.8203 },
  { name: 'Gladstone',      lat: -23.8434, lng: 151.2466 },
  { name: 'Mount Isa',      lat: -20.7256, lng: 139.4927 },
  { name: 'Roma',           lat: -26.5740, lng: 148.7872 },
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
const TIMEOUT_MS = parseInt(process.env.FUEL_PRICE_FETCH_TIMEOUT_MS || '20000', 10);

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
      throw new Error(`QLD FPM ${path} → HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json();
  }

  async _loadBrandMap() {
    // GetCountryBrands returns { Brands: [{ BrandId, Name }, ...] }
    try {
      const data = await this._fetch('/Subscriber/GetCountryBrands?countryId=21');
      const arr = data?.Brands || data?.brands || [];
      const map = new Map();
      for (const b of arr) {
        const id = b.BrandId ?? b.Id ?? b.B;
        const name = b.Name ?? b.N ?? `Brand ${id}`;
        if (id != null) map.set(Number(id), String(name));
      }
      return map;
    } catch (err) {
      console.warn('[qld_fpm] GetCountryBrands failed, brands will show as IDs:', err.message);
      return new Map();
    }
  }

  async fetchSnapshot() {
    const sitesPath  = '/Subscriber/GetFullSiteDetails?countryId=21&geoRegionLevel=3&geoRegionId=1';
    const pricesPath = '/Price/GetSitesPrices?countryId=21&geoRegionLevel=3&geoRegionId=1';

    const [sitesData, pricesData, brandMap] = await Promise.all([
      this._fetch(sitesPath),
      this._fetch(pricesPath),
      this._loadBrandMap(),
    ]);

    // The spec uses single-letter compressed field names. Some sandbox
    // payloads use full names. Handle both gracefully.
    const sitesArr  = sitesData?.S || sitesData?.Sites || sitesData?.sites || [];
    const pricesArr = pricesData?.SitePrices || pricesData?.SP || pricesData?.sitePrices || pricesData?.Prices || [];

    const stations = sitesArr.map((s) => {
      const lat = Number(s.Lat ?? s.Latitude);
      const lng = Number(s.Lng ?? s.Longitude);
      const brandId = Number(s.B ?? s.BrandId ?? s.Brand);
      const brandName = brandMap.get(brandId) || (Number.isFinite(brandId) ? `Brand ${brandId}` : null);
      return {
        station_id: String(s.S ?? s.SiteId ?? s.Id),
        name: s.N ?? s.SiteName ?? s.Name ?? 'Unnamed station',
        brand: brandName,
        address: s.A ?? s.Address ?? null,
        region: nearestRegion(lat, lng),
        postcode: s.P != null ? String(s.P) : (s.Postcode ? String(s.Postcode) : null),
        latitude: lat,
        longitude: lng,
        is_open: s.IsOpen !== false,
      };
    }).filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));

    const prices = pricesArr.map((p) => {
      // Spec lists "Siteld"/"Fuelld" (lowercase L) which is almost certainly
      // a PDF OCR artefact of "SiteId"/"FuelId" — handle both.
      const fuelIdNum = Number(p.FuelId ?? p.Fuelld ?? p.F);
      const fuelType  = QLD_FUEL_ID_MAP[fuelIdNum];
      if (!fuelType) return null;        // ignore unknown fuel codes
      const cents = priceTenthsToCents(p.Price ?? p.P);
      if (cents == null) return null;
      return {
        station_id: String(p.SiteId ?? p.Siteld ?? p.S),
        fuel_type: fuelType,
        price_cents: cents,
        provider_updated_at: p.TransactionDateUtc || p.U || new Date().toISOString(),
      };
    }).filter(Boolean);

    return { stations, prices, provider_label: this.label };
  }
}
