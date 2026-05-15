// MockProvider — returns a deterministic snapshot of ~80 QLD service
// stations across all major regions, with all 6 fuel grades. Used until
// the user receives their QLD FPM SubscriberToken so we can develop and
// demo the Live Prices map with realistic-looking data.
//
// Output shape MUST match QldFpmProvider so they're swappable behind one
// env var (FUEL_PROVIDER='mock'|'qld_fpm').
//
//   fetchSnapshot() => Promise<{
//     stations: [{ station_id, name, brand, address, region, postcode,
//                  latitude, longitude, is_open }],
//     prices:   [{ station_id, fuel_type, price_cents, provider_updated_at }],
//     provider_label,
//   }>

const BRANDS = [
  'Shell', 'BP', 'Caltex', '7-Eleven', 'Coles Express', 'United', 'Mobil',
  'Ampol', 'Liberty', 'EG Fuel', 'Puma', 'Metro', 'Independent',
];

// Region anchors (centre lat, centre lng, station count to scatter around).
const REGION_ANCHORS = [
  { name: 'Brisbane',       lat: -27.4705, lng: 153.0268, count: 18, postcodeBase: 4000 },
  { name: 'Gold Coast',     lat: -28.0028, lng: 153.4314, count: 12, postcodeBase: 4215 },
  { name: 'Sunshine Coast', lat: -26.7964, lng: 153.0966, count: 9,  postcodeBase: 4558 },
  { name: 'Toowoomba',      lat: -27.5598, lng: 151.9507, count: 7,  postcodeBase: 4350 },
  { name: 'Cairns',         lat: -16.8766, lng: 145.7781, count: 8,  postcodeBase: 4870 },
  { name: 'Townsville',     lat: -19.2589, lng: 146.8169, count: 7,  postcodeBase: 4810 },
  { name: 'Mackay',         lat: -21.1421, lng: 149.1865, count: 6,  postcodeBase: 4740 },
  { name: 'Rockhampton',    lat: -23.3781, lng: 150.5100, count: 6,  postcodeBase: 4700 },
  { name: 'Bundaberg',      lat: -24.8661, lng: 152.3489, count: 5,  postcodeBase: 4670 },
  { name: 'Hervey Bay',     lat: -25.2882, lng: 152.8203, count: 4,  postcodeBase: 4655 },
];

// Deterministic pseudo-random so the demo data stays consistent across
// reloads but still varies a little between sync passes (we mix in the
// minute-of-hour bucket).
function rng(seed) {
  let s = seed | 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const FUEL_BASE_CENTS = {
  ULP91:  189,
  E10:    184,
  U95:    198,
  U98:    211,
  Diesel: 192,
  LPG:    105,
};

export class MockProvider {
  constructor() {
    this.label = 'mock';
  }

  async fetchSnapshot() {
    const minuteBucket = Math.floor(Date.now() / (1000 * 60 * 15)); // shifts each 15 min
    const stations = [];
    const prices = [];
    const now = new Date().toISOString();

    let idx = 0;
    for (const region of REGION_ANCHORS) {
      const rand = rng(region.name.length * 31 + 7);
      for (let i = 0; i < region.count; i++) {
        idx += 1;
        const station_id = `MOCK-${String(idx).padStart(5, '0')}`;
        const brand = BRANDS[Math.floor(rand() * BRANDS.length)];
        // Scatter within ~10–15 km of the region anchor.
        const dLat = (rand() - 0.5) * 0.18;
        const dLng = (rand() - 0.5) * 0.18;
        const latitude = +(region.lat + dLat).toFixed(7);
        const longitude = +(region.lng + dLng).toFixed(7);
        const streetNum = Math.floor(rand() * 998) + 1;
        const streetNames = ['Queen St','Main Rd','Bruce Hwy','Anzac Ave','Pacific Mwy','Beach Rd','Coast Hwy','Hospital Rd','Showgrounds Dr','Logan Rd'];
        const street = streetNames[Math.floor(rand() * streetNames.length)];
        const postcode = String(region.postcodeBase + Math.floor(rand() * 30));

        stations.push({
          station_id,
          name: `${brand} ${region.name}${i > 0 ? ` ${['North','South','East','West','Central'][i % 5]}` : ''}`,
          brand,
          address: `${streetNum} ${street}, ${region.name} QLD ${postcode}`,
          region: region.name,
          postcode,
          latitude,
          longitude,
          is_open: true,
        });

        for (const [fuel, base] of Object.entries(FUEL_BASE_CENTS)) {
          // 90% of stations carry ULP91/Diesel. ~70% carry E10/U95. ~55% U98.
          // ~30% LPG. Skips simulate "fuel not sold here".
          const carryRoll = rand();
          if (fuel === 'U98' && carryRoll > 0.55) continue;
          if (fuel === 'E10' && carryRoll > 0.72) continue;
          if (fuel === 'U95' && carryRoll > 0.70) continue;
          if (fuel === 'LPG' && carryRoll > 0.30) continue;

          // Per-station deviation +/- ~6¢ from base, plus a small jitter
          // that shifts each 15-min bucket so successive syncs look alive.
          const stationDev = Math.floor((rand() - 0.5) * 12);
          const bucketJitter = ((minuteBucket + idx) % 7) - 3;
          const price_cents = Math.max(70, base * 10 + stationDev * 10 + bucketJitter * 10) / 10;
          // Round to 1 decimal cent (e.g. 189.7).
          const rounded = Math.round(price_cents);
          prices.push({
            station_id,
            fuel_type: fuel,
            price_cents: Math.round(rounded * 10),
            provider_updated_at: now,
          });
        }
      }
    }

    return { stations, prices, provider_label: this.label };
  }
}
