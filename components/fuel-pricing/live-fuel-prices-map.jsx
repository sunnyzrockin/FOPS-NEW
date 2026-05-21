'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, LayersControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { getBrandStyle, getPriceBandColor } from '@/lib/fuel-pricing/brand-styles';

/**
 * LiveFuelPricesMap — Leaflet client component. Centred on QLD by default.
 * Uses leaflet.markercluster to group the 1,600+ QLD stations at low zoom
 * levels and expands them into individual BRAND-COLOURED pins as the user
 * zooms in. Each pin:
 *   - Background fill = the brand's primary colour (Shell yellow, BP green,
 *     7-Eleven orange, Caltex red, Ampol blue, etc.)
 *   - Border ring     = price band (emerald = cheap, amber = mid, red = expensive)
 *   - Letter inside   = short brand code ("SH", "BP", "7E", "CA", "AM", ...)
 * Defined in /app/lib/fuel-pricing/brand-styles.js — extend there to add more
 * brands or tweak colours.
 */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Internal layer component — has to live inside <MapContainer> so we can
 * grab the Leaflet map instance via useMap(). On every render we rebuild
 * the cluster group from the current `stations` prop.
 */
function ClusteredStationsLayer({ stations, priceStats, fuelLabel }) {
  const map = useMap();
  const layerRef = useRef(null);

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
      const brandStyle = getBrandStyle(s.brand);
      const ring = getPriceBandColor(s.price_cents, priceStats);
      const priceFmt = `$${(s.price_cents / 100).toFixed(3)}`;

      const iconHtml = `
        <div style="
          width:30px;height:30px;border-radius:50%;
          background:${brandStyle.bg};
          color:${brandStyle.fg};
          border:3px solid ${ring};
          display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:10px;letter-spacing:-0.3px;
          font-family:Inter,system-ui,sans-serif;
          box-shadow:0 2px 6px rgba(0,0,0,0.35);
          line-height:1;">
          ${escapeHtml(brandStyle.label)}
        </div>
      `;

      const marker = L.marker([s.latitude, s.longitude], {
        icon: L.divIcon({
          html: iconHtml,
          className: 'fops-brand-pin',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        // Z-order so cheapest sit on top of expensive when overlapping
        zIndexOffset: ring === '#10b981' ? 1000 : ring === '#f59e0b' ? 500 : 0,
      });

      marker.bindTooltip(
        `<strong>${priceFmt}</strong> · ${escapeHtml(s.brand || 'Unbranded')}`,
        { direction: 'top', offset: [0, -10], opacity: 0.95 }
      );

      const popup = `
        <div style="min-width:200px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <div style="
              width:24px;height:24px;border-radius:50%;
              background:${brandStyle.bg};color:${brandStyle.fg};
              display:flex;align-items:center;justify-content:center;
              font-weight:800;font-size:9px;flex-shrink:0;
              border:2px solid ${ring};">${escapeHtml(brandStyle.label)}</div>
            <div style="font-weight:600;">${escapeHtml(s.name || 'Station')}</div>
          </div>
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
  }, [map, stations, priceStats, fuelLabel]);

  return null;
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
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Streets">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
        </LayersControl>
        <ClusteredStationsLayer
          stations={stations}
          priceStats={priceStats}
          fuelLabel={fuelLabel}
        />
      </MapContainer>
    </div>
  );
}
