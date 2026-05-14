'use client';

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import LeafletMapInner from './leaflet-map-inner';

/**
 * LeafletMapClient — Thin client-only wrapper around LeafletMapInner so the
 * Leaflet runtime never executes during SSR. Extracted from
 * /app/app/app/page.js.
 */
export default function LeafletMapClient({ currentSite, competitors, priceData }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  if (!isClient || typeof window === 'undefined') {
    return (
      <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      </div>
    );
  }

  return <LeafletMapInner currentSite={currentSite} competitors={competitors} priceData={priceData} />;
}
