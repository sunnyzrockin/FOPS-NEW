'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, LayersControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { getBrandStyle, getPriceBandColor, getFuelGradeShortLabel } from '@/lib/fuel-pricing/brand-styles';

/**
 * LiveFuelPricesMap — Leaflet client component. Centred on QLD by default.
 * Uses leaflet.markercluster to group the 1,600+ QLD stations at low zoom
 * levels and expands them into individual PetrolSpy-style markers as the
 * user zooms in. Each marker is a stacked badge:
 *
 *   ┌──────────────────┐
 *   │  Prem   231.9    │  ← yellow price tag (grade + red price digits)
 *   └──────────────────┘
 *   ┌──────────────────┐
 *   │      Shell        │  ← brand shield (Shell yellow, BP green, etc.)
 *   └────────▼─────────┘     with a downward pointer to the actual location
 *
 * Brand colours and wordmarks are defined in /app/lib/fuel-pricing/brand-styles.js
 * — extend there to add more brands or tweak appearance.
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

      // PetrolSpy-style: split price into integer.tenths (e.g. 231.9)
      const priceDollarsPerL = s.price_cents / 100;
      const priceDisplay = priceDollarsPerL.toFixed(1); // e.g. "2.3" — but we want cents-style "231.9"
      const priceCentsDisplay = (s.price_cents / 10).toFixed(1); // 2319 → 231.9
      const gradeShort = getFuelGradeShortLabel(s.fuel_type || fuelLabel || '');

      // Dynamic font sizing for the brand wordmark so longer names fit.
      const wm = brandStyle.wordmark || brandStyle.label;
      const wmLen = wm.length;
      const wmFontSize = wmLen <= 4 ? 11 : wmLen <= 6 ? 10 : wmLen <= 8 ? 9 : 8;

      // Build the stacked icon: yellow price tag on top, brand shield below
      // with a downward pointer. The whole thing is 78×46 px so it stays
      // crisp at all zoom levels.
      const iconHtml = `
        <div style="
          display:flex;flex-direction:column;align-items:center;
          font-family:Inter,system-ui,-apple-system,sans-serif;
          filter:drop-shadow(0 2px 3px rgba(0,0,0,0.35));
          line-height:1;
        ">
          <!-- Price tag -->
          <div style="
            background:#FFF200;
            border:1.5px solid #1A1A1A;
            border-radius:3px;
            padding:1px 5px 2px;
            min-width:54px;
            display:flex;align-items:center;justify-content:space-between;gap:4px;
          ">
            <span style="
              font-size:8px;font-weight:600;color:#1A1A1A;
              text-transform:none;letter-spacing:-0.2px;
            ">${escapeHtml(gradeShort || '')}</span>
            <span style="
              font-size:11px;font-weight:800;color:#D40000;
              letter-spacing:-0.3px;font-variant-numeric:tabular-nums;
            ">${priceCentsDisplay}</span>
          </div>
          <!-- Brand shield with downward pointer (tail) -->
          <div style="
            margin-top:1px;
            background:${brandStyle.bg};
            color:${brandStyle.fg};
            border:1.5px solid ${brandStyle.accent || '#1A1A1A'};
            border-radius:3px;
            padding:2px 5px;
            min-width:54px;
            text-align:center;
            font-weight:800;
            font-size:${wmFontSize}px;
            letter-spacing:-0.2px;
            text-transform:uppercase;
            position:relative;
          ">
            ${escapeHtml(wm)}
            <!-- triangle pointer below -->
            <div style="
              position:absolute;left:50%;bottom:-7px;transform:translateX(-50%);
              width:0;height:0;
              border-left:6px solid transparent;
              border-right:6px solid transparent;
              border-top:7px solid ${brandStyle.accent || '#1A1A1A'};
            "></div>
            <div style="
              position:absolute;left:50%;bottom:-5px;transform:translateX(-50%);
              width:0;height:0;
              border-left:4.5px solid transparent;
              border-right:4.5px solid transparent;
              border-top:5px solid ${brandStyle.bg};
            "></div>
          </div>
          <!-- Price-band dot (cheap=green / mid=amber / expensive=red) -->
          <div style="
            margin-top:6px;
            width:6px;height:6px;border-radius:50%;
            background:${ring};
            box-shadow:0 0 0 1.5px #fff;
          "></div>
        </div>
      `;

      const marker = L.marker([s.latitude, s.longitude], {
        icon: L.divIcon({
          html: iconHtml,
          className: 'fops-brand-pin',
          iconSize: [78, 56],
          iconAnchor: [39, 56], // tip of the price-band dot
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
              padding:2px 8px;border-radius:3px;
              background:${brandStyle.bg};color:${brandStyle.fg};
              font-weight:800;font-size:10px;flex-shrink:0;
              border:1.5px solid ${brandStyle.accent || '#1A1A1A'};
              text-transform:uppercase;letter-spacing:0.3px;
            ">${escapeHtml(wm)}</div>
            <div style="font-weight:600;flex:1;">${escapeHtml(s.name || 'Station')}</div>
          </div>
          ${s.brand ? `<div style="font-size:12px;color:#666;">${escapeHtml(s.brand)}</div>` : ''}
          ${s.address ? `<div style="font-size:12px;margin-top:4px;">${escapeHtml(s.address)}</div>` : ''}
          <div style="margin-top:8px;font-size:14px;">
            <span style="font-weight:600;">${escapeHtml(fuelLabel || gradeShort || '')}: </span>
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

/**
 * MapController — applies imperative map actions (flyTo, fitBounds) when
 * the `target` prop changes. Lives inside <MapContainer> so it can grab
 * the Leaflet map via useMap().
 *
 * Supported targets:
 *   { kind: 'point', center: [lat,lng], zoom?: 13 }
 *   { kind: 'bounds', bounds: [[s,w],[n,e]], padding?: 20 }
 *   { kind: 'reset' }   — resets to default QLD view
 *
 * Each target object is identity-compared (we look at .ts) so the user
 * can click the same button twice and the map will re-fly.
 */
function MapController({ target, defaultCenter, defaultZoom }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !target) return;
    try {
      if (target.kind === 'point' && Array.isArray(target.center)) {
        map.flyTo(target.center, target.zoom ?? 13, { duration: 1.0 });
      } else if (target.kind === 'bounds' && Array.isArray(target.bounds)) {
        const [sw, ne] = target.bounds;
        if (sw[0] === ne[0] && sw[1] === ne[1]) {
          // Single-point "bounds" — flyTo a sensible zoom instead.
          map.flyTo(sw, 14, { duration: 1.0 });
        } else {
          map.flyToBounds(target.bounds, { padding: [40, 40], duration: 1.0, maxZoom: 14 });
        }
      } else if (target.kind === 'reset') {
        map.flyTo(defaultCenter, defaultZoom, { duration: 1.0 });
      }
    } catch (e) {
      console.warn('[MapController] action failed', e);
    }
  }, [map, target, defaultCenter, defaultZoom]);
  return null;
}

export default function LiveFuelPricesMap({ stations, priceStats, fuelLabel, target }) {
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
        <MapController target={target} defaultCenter={center} defaultZoom={zoom} />
        <ClusteredStationsLayer
          stations={stations}
          priceStats={priceStats}
          fuelLabel={fuelLabel}
        />
      </MapContainer>
    </div>
  );
}
