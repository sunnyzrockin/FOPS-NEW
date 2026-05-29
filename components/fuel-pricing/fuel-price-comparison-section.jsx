'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Fuel, Building2 } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * FuelPriceComparisonSection — Owner-facing "Fuel Price Intelligence" section.
 * As of June 2025 this is LIST-ONLY: a per-site grid of nearby competitor
 * prices with insights. The previous Map View has been removed at the
 * owner's request (the QLD Live Prices tab now covers that use-case at a
 * statewide level).
 *
 * Pulls /api/fuel-price-comparison and renders one card per owned site
 * showing own price vs. competitor band per fuel type.
 */
export default function FuelPriceComparisonSection({ sites, siteIds }) {
  const [priceData, setPriceData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const loadPriceData = useCallback(async () => {
    if (!siteIds) return;
    setLoading(true);
    try {
      const res = await authedFetch(`/api/fuel-price-comparison?siteIds=${siteIds}&date=${selectedDate}`);
      const data = await res.json();
      setPriceData(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load fuel price data:', err);
    } finally {
      setLoading(false);
    }
  }, [siteIds, selectedDate]);

  useEffect(() => { loadPriceData(); }, [loadPriceData]);

  const getInsightColor = (type) => {
    if (type === 'good') return 'bg-green-50 text-green-700 border-green-200';
    if (type === 'warning') return 'bg-orange-50 text-orange-700 border-orange-200';
    if (type === 'danger') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  const getPriceColor = (isOwn, isMin, isMax) => {
    if (isOwn) return 'text-blue-600 font-bold';
    if (isMin) return 'text-green-600 font-semibold';
    if (isMax) return 'text-red-600';
    return 'text-gray-700';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }
  if (priceData.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Fuel className="h-5 w-5" /> Fuel Price Intelligence
          </h3>
          <p className="text-sm text-muted-foreground">Your current prices alongside nearby competitor benchmarks</p>
        </div>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-[180px]"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(priceData || []).map((site) => (
          <Card key={site.site_id} className="border border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {site.site_name}
              </CardTitle>
              <CardDescription className="text-xs">{site.site_code}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(site.fuel_data).map(([fuelType, data]) => (
                <div key={fuelType} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{fuelType}</span>
                    {data.own_price && (
                      <span className="text-lg font-bold text-blue-600">
                        ${(data.own_price / 100).toFixed(1)}
                      </span>
                    )}
                  </div>

                  {data.competitor_prices && data.competitor_prices.length > 0 && (
                    <div className="space-y-1 pl-3 border-l-2 border-slate-200">
                      {data.competitor_prices.map((comp, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <span className={getPriceColor(false, comp.price === data.min_competitor_price, comp.price === data.max_competitor_price)}>
                            {comp.competitor_name}
                          </span>
                          <span className={getPriceColor(false, comp.price === data.min_competitor_price, comp.price === data.max_competitor_price)}>
                            ${(comp.price / 100).toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {data.insight && (
                    <div className={`text-xs p-2 rounded border ${getInsightColor(data.insight_type)}`}>
                      {data.insight}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
