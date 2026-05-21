'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, Loader2, MapPin, Fuel, AlertCircle, Search, Crosshair, Maximize2 } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

// react-leaflet imports must be client-only; SSR will crash because Leaflet
// touches `window` at module-eval time.
const LiveFuelPricesMap = dynamic(() => import('./live-fuel-prices-map'), {
  ssr: false,
  loading: () => (
    <div className="h-[600px] w-full flex items-center justify-center bg-slate-50 rounded-xl">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
    </div>
  ),
});

const FUEL_LABELS = {
  ULP91: 'ULP 91',
  E10: 'E10',
  U95: 'Premium 95',
  U98: 'Premium 98',
  Diesel: 'Diesel',
  LPG: 'LPG',
};

function timeAgo(iso) {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'in the future';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} day(s) ago`;
}

/**
 * LiveFuelPricesDashboard — owner-only "QLD Live Prices" tab. Renders a
 * Leaflet map of every QLD service station coloured by current price for
 * the selected fuel type. Filters: fuel type, region, brand, max price.
 *
 * Backend:
 *   GET /api/fuel-prices-live/filters    — populate region/brand dropdowns
 *   GET /api/fuel-prices-live/stations?fuel_type&region&brand&max_price
 *   POST /api/fuel-prices-live/sync      — manual refresh button
 *   GET /api/fuel-prices-live/status     — "Updated XX ago" footer
 *
 * Cache: backend auto-refreshes every 15 min on read (Phase 3 Q5 = A).
 */
export default function LiveFuelPricesDashboard() {
  const [filters, setFilters] = useState({
    regions: [],
    brands: [],
    fuel_types: ['ULP91', 'E10', 'U95', 'U98', 'Diesel', 'LPG'],
  });
  const [filterLoading, setFilterLoading] = useState(true);
  const [stations, setStations] = useState([]);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [syncMeta, setSyncMeta] = useState(null);
  const [syncBusy, setSyncBusy] = useState(false);

  const [fuelType, setFuelType] = useState('ULP91');
  const [region, setRegion] = useState('all');
  const [brand, setBrand] = useState('all');
  const [maxPrice, setMaxPrice] = useState('');

  // Map navigation state — bumped every time the user hits Search/Locate/Fit.
  // The map component watches `mapTarget` and flies to its `center`/`bounds`.
  const [mapTarget, setMapTarget] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchHint, setSearchHint] = useState(null); // {ok, message, ...}

  const onSearchPostcode = async (e) => {
    e?.preventDefault?.();
    const q = searchQuery.trim();
    if (!q) return;
    setSearchBusy(true);
    setSearchHint(null);
    try {
      const res = await authedFetch(
        `/api/fuel-prices-live/postcode-lookup?q=${encodeURIComponent(q)}`
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSearchHint({
          ok: false,
          message: data.error || `No stations match "${q}"`,
        });
        return;
      }
      setMapTarget({ kind: 'bounds', bounds: data.bounds, ts: Date.now() });
      setSearchHint({
        ok: true,
        message: `Jumped to ${data.sampleSuburb || q} · ${data.stationCount} station${data.stationCount === 1 ? '' : 's'} (${data.mode.replace('_', ' ')})`,
      });
    } catch (err) {
      setSearchHint({ ok: false, message: err?.message || 'Search failed' });
    } finally {
      setSearchBusy(false);
    }
  };

  const onLocateMe = () => {
    setSearchHint(null);
    if (!navigator.geolocation) {
      setSearchHint({ ok: false, message: 'Geolocation not supported by this browser' });
      return;
    }
    setSearchBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapTarget({
          kind: 'point',
          center: [pos.coords.latitude, pos.coords.longitude],
          zoom: 13,
          ts: Date.now(),
        });
        setSearchHint({ ok: true, message: 'Centred on your current location' });
        setSearchBusy(false);
      },
      (err) => {
        setSearchHint({
          ok: false,
          message: err?.code === 1 ? 'Location permission denied' : (err?.message || 'Failed to get location'),
        });
        setSearchBusy(false);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  };

  const onFitToQld = () => {
    setMapTarget({ kind: 'reset', ts: Date.now() });
    setSearchHint(null);
  };

  // 1) Load filter options once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFilterLoading(true);
      try {
        const res = await authedFetch('/api/fuel-prices-live/filters');
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setFilters({
            regions: data.regions || [],
            brands: data.brands || [],
            fuel_types: data.fuel_types || ['ULP91','E10','U95','U98','Diesel','LPG'],
          });
        } else {
          setError(data.error || 'Failed to load filters');
        }
      } catch (e) {
        setError(e.message);
      } finally {
        if (!cancelled) setFilterLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 2) Load stations whenever filters change
  const loadStations = useCallback(async () => {
    if (!fuelType) return;
    setStationsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ fuel_type: fuelType });
      if (region && region !== 'all') params.set('region', region);
      if (brand && brand !== 'all') params.set('brand', brand);
      if (maxPrice && Number(maxPrice) > 0) params.set('max_price', String(maxPrice));
      const res = await authedFetch(`/api/fuel-prices-live/stations?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setStations(data.stations || []);
      setSyncMeta(data.sync || null);
    } catch (e) {
      setError(e.message);
      setStations([]);
    } finally {
      setStationsLoading(false);
    }
  }, [fuelType, region, brand, maxPrice]);

  useEffect(() => { loadStations(); }, [loadStations]);

  // 3) Manual refresh
  const onSync = async () => {
    setSyncBusy(true);
    setError(null);
    try {
      const res = await authedFetch('/api/fuel-prices-live/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Sync failed (${res.status})`);
      setSyncMeta(data.sync || null);
      await loadStations();
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncBusy(false);
    }
  };

  // 4) Compute price colour bands so the map matches PetrolSpy's visual
  //    language: cheap = green, mid = amber, expensive = red.
  const priceStats = useMemo(() => {
    if (!stations.length) return null;
    const prices = stations.map((s) => s.price_cents).sort((a, b) => a - b);
    const min = prices[0];
    const max = prices[prices.length - 1];
    const median = prices[Math.floor(prices.length / 2)];
    return { min, max, median };
  }, [stations]);

  // 5) Aggregate summary line: "1,734 stations · ULP91 · cheapest $1.82 · median $1.89"
  const headerSummary = useMemo(() => {
    if (!stations.length) return 'No matching stations';
    if (!priceStats) return `${stations.length} stations`;
    return `${stations.length.toLocaleString()} station${stations.length === 1 ? '' : 's'} · ${FUEL_LABELS[fuelType] || fuelType} · cheapest $${(priceStats.min / 100).toFixed(3)} · median $${(priceStats.median / 100).toFixed(3)}`;
  }, [stations.length, priceStats, fuelType]);

  return (
    <div className="container mx-auto px-4 py-6 space-y-4">
      {/* Filter bar */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Fuel type</Label>
              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1100]">
                  {(filters.fuel_types || []).map((f) => (
                    <SelectItem key={f} value={f}>{FUEL_LABELS[f] || f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Region</Label>
              <Select value={region} onValueChange={setRegion} disabled={filterLoading}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1100]">
                  <SelectItem value="all">All regions</SelectItem>
                  {filters.regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Brand</Label>
              <Select value={brand} onValueChange={setBrand} disabled={filterLoading}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1100]">
                  <SelectItem value="all">All brands</SelectItem>
                  {filters.brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max price (AUD/L)</Label>
              <Input
                type="number" step="0.01" inputMode="decimal" placeholder="e.g. 1.85"
                value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
                className="w-[140px]"
              />
            </div>
            <Button variant="outline" size="sm" onClick={onSync} disabled={syncBusy} className="ml-auto">
              {syncBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh prices
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Status banner */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge variant="outline" className="bg-white">
          <MapPin className="h-3 w-3 mr-1" /> {headerSummary}
        </Badge>
        {syncMeta?.last_fetched_at && (
          <Badge variant={syncMeta.last_status === 'ok' ? 'secondary' : 'destructive'}>
            Updated {timeAgo(syncMeta.last_fetched_at)}
            {syncMeta.provider ? ` · ${syncMeta.provider}` : ''}
          </Badge>
        )}
        {syncMeta?.last_status === 'error' && (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" /> Last sync failed — showing cached data
          </Badge>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Postcode / locate toolbar */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={onSearchPostcode} className="flex items-center gap-2 flex-1 min-w-[260px]">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Postcode or suburb (e.g. 4000, Brisbane, Capalaba)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  inputMode="search"
                />
              </div>
              <Button type="submit" size="sm" disabled={searchBusy || !searchQuery.trim()}>
                {searchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Go'}
              </Button>
            </form>
            <Button variant="outline" size="sm" onClick={onLocateMe} disabled={searchBusy} className="gap-2">
              <Crosshair className="h-4 w-4" /> My location
            </Button>
            <Button variant="outline" size="sm" onClick={onFitToQld} className="gap-2">
              <Maximize2 className="h-4 w-4" /> Fit to QLD
            </Button>
          </div>
          {searchHint && (
            <div
              className={`mt-2 text-xs px-3 py-2 rounded border ${
                searchHint.ok
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              {searchHint.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Map */}
      <Card className="border-0 shadow-lg overflow-hidden mt-6">
        <CardContent className="p-0 relative">
          {stationsLoading && (
            <div className="absolute inset-0 z-[450] flex items-center justify-center bg-white/60 pointer-events-none">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          )}
          <LiveFuelPricesMap
            stations={stations}
            priceStats={priceStats}
            fuelLabel={FUEL_LABELS[fuelType] || fuelType}
            target={mapTarget}
          />
        </CardContent>
      </Card>

      {/* Legend */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-center gap-6 flex-wrap text-sm">
            <span className="font-medium flex items-center gap-2"><Fuel className="h-4 w-4" /> Price legend</span>
            <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-emerald-500" /> Cheap (bottom third)</span>
            <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-amber-500" /> Mid</span>
            <span className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full bg-red-500" /> Expensive (top third)</span>
            <span className="text-muted-foreground ml-auto">Auto-refreshes every 15 minutes on page load</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
