'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';

import { toast } from 'sonner';
import { authedFetch } from '@/lib/authed-fetch';
/**
 * FuelPriceEntry — Operator-facing form to record both their own pump
 * prices and competitor prices for a given date. Calls
 * /api/fuel-price-entries and /api/competitor-prices.
 * Extracted from /app/app/app/page.js.
 */
export default function FuelPriceEntry({ user, sites }) {
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [prices, setPrices] = useState({ ULP: '', Diesel: '', Premium: '' });
  const [competitorPrices, setCompetitorPrices] = useState({});
  const [competitors, setCompetitors] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedSite) {
      authedFetch(`/api/site-competitors?siteId=${selectedSite}`)
        .then((r) => r.json())
        .then((d) => setCompetitors(Array.isArray(d) ? d : []));
    }
  }, [selectedSite]);

  const handleSavePrices = async () => {
    setLoading(true);
    try {
      for (const [fuelType, price] of Object.entries(prices)) {
        if (price) {
          await authedFetch('/api/fuel-price-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              site_id: selectedSite,
              fuel_type: fuelType,
              own_price: parseFloat(price),
              date: selectedDate,
              entered_by_user_id: user.id,
            }),
          });
        }
      }

      for (const [key, price] of Object.entries(competitorPrices)) {
        if (price) {
          const [compName, fuelType] = key.split('_');
          await authedFetch('/api/competitor-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              site_id: selectedSite,
              competitor_name: compName,
              fuel_type: fuelType,
              price: parseFloat(price),
              recorded_at: selectedDate,
              entered_by_user_id: user.id,
            }),
          });
        }
      }

      toast.success('Prices saved successfully!');
      setPrices({ ULP: '', Diesel: '', Premium: '' });
      setCompetitorPrices({});
    } catch (err) {
      toast.error('Failed to save prices');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Fuel Price Entry</h2>
        <p className="text-muted-foreground">Enter your fuel prices and competitor prices</p>
      </div>

      <div className="flex gap-4">
        <Select value={selectedSite} onValueChange={setSelectedSite}>
          <SelectTrigger className="w-[250px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-[180px]"
        />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Your Prices</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {['ULP', 'Diesel', 'Premium'].map((ft) => (
            <div key={ft} className="flex items-center gap-3">
              <Label className="w-24">{ft}</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="185.9"
                value={prices[ft]}
                onChange={(e) => setPrices((p) => ({ ...p, [ft]: e.target.value }))}
                className="w-32"
              />
              <span className="text-xs text-muted-foreground">cents/litre</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {competitors.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Competitor Prices</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {competitors.map((comp) => (
              <div key={comp.id} className="space-y-2 p-3 bg-slate-50 rounded">
                <p className="font-medium text-sm">{comp.competitor_name}</p>
                <div className="grid grid-cols-3 gap-3">
                  {['ULP', 'Diesel', 'Premium'].map((ft) => (
                    <Input
                      key={ft}
                      type="number"
                      step="0.1"
                      placeholder={ft}
                      value={competitorPrices[`${comp.competitor_name}_${ft}`] || ''}
                      onChange={(e) => setCompetitorPrices((p) => ({
                        ...p,
                        [`${comp.competitor_name}_${ft}`]: e.target.value,
                      }))}
                      className="text-sm"
                    />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Button onClick={handleSavePrices} disabled={loading} className="w-full">
        {loading
          ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
          : <><Save className="h-4 w-4 mr-2" /> Save All Prices</>}
      </Button>
    </div>
  );
}
