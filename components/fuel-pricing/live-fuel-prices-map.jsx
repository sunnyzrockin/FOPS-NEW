'use client';

import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * LiveFuelPricesMap — Leaflet client component. Centred on QLD by default.
 * Uses CircleMarker (cheap to render thousands of) instead of <Marker>
 * so we can paint 1,700+ stations without melting the browser.
 *
 * Colour bands:
 *   bottom third of price range → emerald (cheapest)
 *   middle third                 → amber
 *   top third                    → red (most expensive)
 * Falls back to blue if priceStats is unavailable.
 */
export default function LiveFuelPricesMap({ stations, priceStats, fuelLabel }) {
  const center = [-22.0, 145.0]; // roughly the centre of QLD
  const zoom = 5;

  const colorFor = useMemo(() => {
    if (!priceStats || priceStats.min === priceStats.max) {
      return () => '#3b82f6'; // blue when there's no spread
    }
    const { min, max } = priceStats;
    const cheapCutoff = min + (max - min) / 3;
    const midCutoff = min + (2 * (max - min)) / 3;
    return (priceCents) => {
      if (priceCents <= cheapCutoff) return '#10b981'; // emerald
      if (priceCents <= midCutoff)   return '#f59e0b'; // amber
      return '#ef4444';                                // red
    };
  }, [priceStats]);

  return (
    <div className="h-[600px] w-full">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {stations.map((s) => (
          <CircleMarker
            key={s.station_id}
            center={[s.latitude, s.longitude]}
            radius={7}
            pathOptions={{
              color: '#ffffff',
              weight: 1,
              fillColor: colorFor(s.price_cents),
              fillOpacity: 0.85,
            }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
              <strong>${(s.price_cents / 100).toFixed(3)}</strong>
              {' · '}{s.brand || 'Unbranded'}
            </Tooltip>
            <Popup>
              <div style={{ minWidth: 200 }}>
                <div style={{ fontWeight: 600 }}>{s.name}</div>
                {s.brand && <div style={{ fontSize: 12, color: '#666' }}>{s.brand}</div>}
                {s.address && <div style={{ fontSize: 12, marginTop: 4 }}>{s.address}</div>}
                <div style={{ marginTop: 8, fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{fuelLabel}: </span>
                  <span>${(s.price_cents / 100).toFixed(3)} / L</span>
                </div>
                {s.is_stale && (
                  <div style={{ marginTop: 4, color: '#b45309', fontSize: 11 }}>
                    ⚠ price may be stale (cached fallback)
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
