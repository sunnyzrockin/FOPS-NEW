'use client';

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

/**
 * LiveFuelPricesMap — Leaflet client component. Centred on QLD by default.
 * Uses leaflet.markercluster to group the 1,600+ QLD stations at low zoom
 * levels and expands them into individual price-coloured markers as the
 * user zooms in.
 *
 * Colour bands (matches PetrolSpy):
 *   bottom third of price range → emerald (cheapest)
 *   middle third                 → amber
 *   top third                    → red (most expensive)
 * Falls back to blue if priceStats is unavailable.
 */

function _colorFor(priceStats) {
  if (!priceStats || priceStats.min === priceStats.max) {
    return () => '#3b82f6';
  }
  const { min, max } = priceStats;
  const cheapCutoff = min + (max - min) / 3;
  const midCutoff = min + (2 * (max - min)) / 3;
  return (priceCents) => {
    if (priceCents <= cheapCutoff) return '#10b981';
    if (priceCents <= midCutoff)   return '#f59e0b';
    return '#ef4444';
  };
}

/**
 * Internal layer component — has to live inside <MapContainer> so we can
 * grab the Leaflet map instance via useMap(). On every render we rebuild
 * the cluster group from the current `stations` prop.
 */
function ClusteredStationsLayer({ stations, priceStats, fuelLabel }) {
  const map = useMap();
  const layerRef = useRef(null);
  const colorFor = useMemo(() => _colorFor(priceStats), [priceStats]);

  useEffect(() => {
    if (!map) return;

    // Build (or rebuild) the cluster group.
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 55,
      // Tighter, brand-matched cluster bubbles
      iconCreateFunction: (c) => {
        const count = c.getChildCount();
        const size = count >= 100 ? 46 : count >= 25 ? 40 : 34;
        return L.divIcon({
          html: `<div style="
            width:${size}px;height:${size}px;border-radius:50%;
            background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);
            color:#fff;display:flex;align-items:center;justify-content:center;
            font-weight:600;font-size:${count >= 100 ? 13 : 12}px;
            box-shadow:0 4px 10px rgba(37,99,235,0.4);
            border:2px solid rgba(255,255,255,0.85);">${count}</div>`,
          className: 'fops-cluster-icon',
          iconSize: [size, size],
        });
      },
    });

    for (const s of stations) {
      if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') continue;
      const fill = colorFor(s.price_cents);
      const marker = L.circleMarker([s.latitude, s.longitude], {
        radius: 7,
        color: '#ffffff',
        weight: 1,
        fillColor: fill,
        fillOpacity: 0.9,
      });

      const priceFmt = `$${(s.price_cents / 100).toFixed(3)}`;
      marker.bindTooltip(
        `<strong>${priceFmt}</strong> · ${s.brand || 'Unbranded'}`,
        { direction: 'top', offset: [0, -6], opacity: 0.95 }
      );

      const popup = `
        <div style="min-width:200px;">
          <div style="font-weight:600;">${escapeHtml(s.name || 'Station')}</div>
          ${s.brand ? `<div style="font-size:12px;color:#666;">${escapeHtml(s.brand)}</div>` : ''}
          ${s.address ? `<div style="font-size:12px;margin-top:4px;">${escapeHtml(s.address)}</div>` : ''}
          <div style="margin-top:8px;font-size:14px;">
            <span style="font-weight:600;">${escapeHtml(fuelLabel || '')}: </span>
            <span>${priceFmt} / L</span>
          </div>
          ${s.is_stale ? `<div style="margin-top:4px;color:#b45309;font-size:11px;">⚠ price may be stale (cached fallback)</div>` : ''}
        </div>
      `;
      marker.bindPopup(popup);

      cluster.addLayer(marker);
    }

    cluster.addTo(map);
    layerRef.current = cluster;

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, stations, colorFor, fuelLabel]);

  return null;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function LiveFuelPricesMap({ stations, priceStats, fuelLabel }) {
  const center = [-22.0, 145.0]; // roughly centre of QLD
  const zoom = 5;

  return (
    <div className="h-[600px] w-full">
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom
        preferCanvas
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClusteredStationsLayer
          stations={stations}
          priceStats={priceStats}
          fuelLabel={fuelLabel}
        />
      </MapContainer>
    </div>
  );
}
