'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * MorningPriceBrief — at-a-glance card grid showing each site's ULP price vs.
 * the cheapest nearby competitor, plus a coloured action suggestion.
 *
 * Pure presentational component; owns its own fetch via /api/fuel-price-comparison.
 * Extracted from /app/app/app/page.js (was inline).
 */
export default function MorningPriceBrief({ sites, selectedDate }) {
  const [briefData, setBriefData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBrief = async () => {
      if (!sites || sites.length === 0) return;
      setLoading(true);
      try {
        const siteIds = sites.map((s) => s.id).join(',');
        const date = selectedDate || new Date().toISOString().split('T')[0];
        const res = await authedFetch(`/api/fuel-price-comparison?siteIds=${siteIds}&date=${date}`);
        const data = await res.json();
        setBriefData(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load brief:', err);
        setBriefData([]);
      } finally {
        setLoading(false);
      }
    };
    loadBrief();
  }, [sites, selectedDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!Array.isArray(briefData) || briefData.length === 0) {
    return <p className="text-sm text-muted-foreground">No price data available</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(briefData || []).map((site) => {
        const ulpData = site.fuel_data?.ULP;
        if (!ulpData || !ulpData.own_price) return null;

        const diff = parseFloat(ulpData.difference_from_min || 0);
        const isCompetitive = Math.abs(diff) <= 2;
        const isCheapest = diff < 0;

        let suggestion = '';
        let actionColor = 'text-teal-600';

        if (isCheapest) {
          suggestion = '✅ You are the cheapest';
          actionColor = 'text-green-600';
        } else if (isCompetitive) {
          suggestion = '✅ Competitive pricing';
          actionColor = 'text-teal-600';
        } else if (diff > 5) {
          suggestion = `⚠️ Consider reducing by ${(diff - 1).toFixed(1)}¢`;
          actionColor = 'text-red-600';
        } else {
          suggestion = `💡 Consider reducing by ${(diff / 2).toFixed(1)}¢`;
          actionColor = 'text-orange-600';
        }

        return (
          <Card key={site.site_id} className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-2">
              <div>
                <p className="font-semibold text-sm">{site.site_name}</p>
                <p className="text-xs text-muted-foreground">{site.site_code}</p>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-xs text-muted-foreground">Your Price:</span>
                <span className="text-xl font-bold text-teal-600">
                  ${(ulpData.own_price / 100).toFixed(1)}
                </span>
              </div>

              {ulpData.min_competitor_price && (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">Lowest Nearby:</span>
                    <span className="text-lg font-semibold text-green-600">
                      ${(ulpData.min_competitor_price / 100).toFixed(1)}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-muted-foreground">Difference:</span>
                    <span className={`font-bold ${diff > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(1)}¢
                    </span>
                  </div>

                  <div className={`text-xs font-medium pt-2 border-t ${actionColor}`}>
                    {suggestion}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
