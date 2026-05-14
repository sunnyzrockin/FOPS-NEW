'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertTriangle } from 'lucide-react';

/**
 * LeafletMapInner — Inner client-only Leaflet map. Renders the current site
 * marker, all competitor markers, and per-fuel popups. Uses require() to
 * dynamically load Leaflet + react-leaflet so SSR doesn't see them.
 * Extracted from /app/app/app/page.js as Phase D of the dashboard monolith
 * refactor.
 */
export default function LeafletMapInner({ currentSite, competitors, priceData }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return (
      <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  try {
    // Dynamically require to keep these out of SSR
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const L = require('leaflet');
    // eslint-disable-next-line @typescript-eslint/no-require-imports, global-require
    const { MapContainer, TileLayer, Marker, Popup } = require('react-leaflet');

    // Fix default marker icon issue with Leaflet + Webpack
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });

    const createIcon = (isOwn, isLowest) => L.divIcon({
      className: 'custom-marker',
      html: `<div class="fuel-marker ${isOwn ? 'own' : isLowest ? 'lowest' : 'competitor'}">${isOwn ? '⛽' : '🏪'}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -30],
    });

    const lowestCompPrice = priceData?.fuel_data?.ULP?.min_competitor_price || 999999;
    const validCompetitors = competitors.filter((c) => c.latitude && c.longitude);

    return (
      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="h-[600px]">
          <MapContainer
            center={[currentSite.latitude, currentSite.longitude]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            key={`map-${currentSite.id}`}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />

            {/* Own Site Marker */}
            <Marker position={[currentSite.latitude, currentSite.longitude]} icon={createIcon(true, false)}>
              <Popup>
                <div className="p-2 min-w-[200px]">
                  <h3 className="font-bold text-sm mb-2">{currentSite.name}</h3>
                  <div className="space-y-1 text-xs">
                    {priceData && Object.entries(priceData.fuel_data).map(([type, data]) => (
                      data.own_price && (
                        <div key={type} className="flex justify-between">
                          <span className="font-medium">{type}:</span>
                          <span className="text-blue-600 font-bold">${(data.own_price / 100).toFixed(1)}</span>
                        </div>
                      )
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">📍 Your Site</p>
                </div>
              </Popup>
            </Marker>

            {/* Competitor Markers */}
            {validCompetitors.map((comp) => {
              const compPrice = priceData?.fuel_data?.ULP?.competitor_prices?.find((cp) => cp.competitor_name === comp.competitor_name);
              const isLowest = compPrice && compPrice.price === lowestCompPrice;
              return (
                <Marker key={comp.id} position={[comp.latitude, comp.longitude]} icon={createIcon(false, isLowest)}>
                  <Popup>
                    <div className="p-2 min-w-[200px]">
                      <h3 className="font-bold text-sm mb-2">{comp.competitor_name}</h3>
                      <div className="space-y-1 text-xs">
                        {priceData && Object.entries(priceData.fuel_data).map(([type, data]) => {
                          const price = data.competitor_prices?.find((cp) => cp.competitor_name === comp.competitor_name);
                          return price ? (
                            <div key={type} className="flex justify-between">
                              <span className="font-medium">{type}:</span>
                              <span className={price.price === data.min_competitor_price ? 'text-green-600 font-bold' : 'text-gray-700'}>
                                ${(price.price / 100).toFixed(1)}
                              </span>
                            </div>
                          ) : null;
                        })}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">📍 {comp.distance_km} km away</p>
                      {isLowest && <p className="text-xs text-green-600 font-semibold mt-1">✨ Lowest Price!</p>}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </Card>
    );
  } catch (error) {
    console.error('Map render error:', error);
    return (
      <Card className="border-0 shadow-lg overflow-hidden">
        <CardContent className="h-[600px] flex flex-col items-center justify-center p-8">
          <AlertTriangle className="h-12 w-12 text-orange-500 mb-4" />
          <p className="text-lg font-semibold mb-2">Map View Unavailable</p>
          <p className="text-sm text-muted-foreground text-center mb-4">
            Unable to load map. Please use List View instead.
          </p>
          <p className="text-xs text-muted-foreground">Error: {error.message}</p>
        </CardContent>
      </Card>
    );
  }
}
