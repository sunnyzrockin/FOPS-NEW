'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle } from 'lucide-react';
import LeafletMapClient from './leaflet-map-client';

/**
 * FuelPriceMapView — Map-view of the Owner Fuel Price Intelligence. Lets
 * the user pick a site and shows it pinned on a Leaflet map along with
 * every nearby competitor. Pulls /api/site-competitors and consumes the
 * already-loaded priceData from the parent.
 * Extracted from /app/app/app/page.js.
 */
export default function FuelPriceMapView({ sites, priceData, selectedDate }) {
  // eslint-disable-next-line no-unused-vars
  const _selectedDate = selectedDate; // referenced by callers; map ignores
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || '');
  const [competitors, setCompetitors] = useState([]);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedSite) {
      setLoading(true);
      fetch(`/api/site-competitors?siteId=${selectedSite}`)
        .then((r) => r.json())
        .then((data) => {
          setCompetitors(Array.isArray(data) ? data : []);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Failed to load competitors:', err);
          setLoading(false);
        });
    }
  }, [selectedSite]);

  const currentSite = sites.find((s) => s.id === selectedSite);
  const currentPriceData = priceData.find((p) => p.site_id === selectedSite);

  if (!mounted) return <div className="h-[600px] bg-slate-100 rounded-lg animate-pulse" />;

  if (!currentSite) {
    return (
      <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
        <p className="text-muted-foreground">No site data available</p>
      </div>
    );
  }

  if (!currentSite.latitude || !currentSite.longitude) {
    return (
      <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
        <div className="text-center p-8">
          <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
          <p className="text-lg font-semibold mb-2">Map coordinates not available</p>
          <p className="text-sm text-muted-foreground">
            Site: {currentSite.name}<br />Please use List View instead.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={selectedSite} onValueChange={setSelectedSite}>
          <SelectTrigger className="w-[300px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {currentPriceData && currentPriceData.fuel_data && currentPriceData.fuel_data.ULP && (
          <Card className="flex-1 border-0 shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="text-sm">
                <span className="text-muted-foreground">Lowest nearby: </span>
                <span className="font-bold text-green-600">
                  ${((currentPriceData.fuel_data.ULP.min_competitor_price || 0) / 100).toFixed(1)}
                </span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">You are: </span>
                <span className={`font-bold ${parseFloat(currentPriceData.fuel_data.ULP.difference_from_min || 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {parseFloat(currentPriceData.fuel_data.ULP.difference_from_min || 0) > 0 ? '+' : ''}
                  {currentPriceData.fuel_data.ULP.difference_from_min || '0'}¢
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {loading ? (
        <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-teal-500" />
        </div>
      ) : (
        <LeafletMapClient currentSite={currentSite} competitors={competitors} priceData={currentPriceData} />
      )}
    </div>
  );
}
