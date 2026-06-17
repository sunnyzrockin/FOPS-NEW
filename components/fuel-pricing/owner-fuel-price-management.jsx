'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Fuel, Plus, Clock, ChevronRight } from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';

import { toast } from 'sonner';
/**
 * OwnerFuelPriceManagement — Owner-facing Fuel Prices tab. Lets the owner
 * create a price change (POST /api/fuel-prices) and view recent changes
 * with their acknowledgement status. Extracted from /app/app/app/page.js.
 */
export default function OwnerFuelPriceManagement({ user, sites }) {
  const [selectedSite, setSelectedSite] = useState('');
  const [fuelType, setFuelType] = useState('ULP');
  const [oldPrice, setOldPrice] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [effectiveTime, setEffectiveTime] = useState(new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [priceChanges, setPriceChanges] = useState([]);
  const [loadingChanges, setLoadingChanges] = useState(true);

  const loadPriceChanges = async () => {
    try {
      const res = await authedFetch('/api/fuel-prices');
      const data = await res.json();
      setPriceChanges(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load price changes:', err);
      setPriceChanges([]);
    } finally {
      setLoadingChanges(false);
    }
  };

  useEffect(() => { loadPriceChanges(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Bug #5: the user picks date + time in their LOCAL timezone (typically
      // AEST/Australia-Brisbane). The previous code naively concatenated
      // `${date}T${time}:00` which has no TZ suffix; Postgres timestamptz
      // then interpreted that as UTC, and when displayed via
      // `toLocaleString('en-AU')` the browser shifted it forward by
      // +10h, landing on the wrong day. Constructing a JS Date first
      // (interpreted as local time) and then `.toISOString()` produces a
      // proper UTC ISO string that round-trips correctly.
      const effectiveDatetime = new Date(`${effectiveDate}T${effectiveTime}:00`).toISOString();

      const res = await authedFetch('/api/fuel-prices', {
        method: 'POST',
        body: JSON.stringify({
          siteId: selectedSite,
          fuelType,
          oldPrice: oldPrice ? parseFloat(oldPrice) : null,
          newPrice: parseFloat(newPrice),
          effectiveDatetime,
          createdByUserId: user.id,
          notes,
        }),
      });

      if (res.ok) {
        toast.success('Price change created and operators notified!');
        setSelectedSite('');
        setOldPrice('');
        setNewPrice('');
        setNotes('');
        loadPriceChanges();
      } else {
        const error = await res.json();
        toast.error(`Error: ${error.error}`);
      }
    } catch (err) {
      toast.error('Failed to create price change');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Fuel className="h-6 w-6 text-teal-600" />
          Fuel Price Management
        </h1>
        <p className="text-muted-foreground mt-1">Create and track fuel price changes across your sites</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Create Price Change
            </CardTitle>
            <CardDescription>Enter new fuel price to notify operators and staff</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="site">Site *</Label>
                <Select value={selectedSite} onValueChange={setSelectedSite} required>
                  <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                  <SelectContent>
                    {sites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>{site.name} ({site.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="fuelType">Fuel Type *</Label>
                <Select value={fuelType} onValueChange={setFuelType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ULP">ULP (Unleaded)</SelectItem>
                    <SelectItem value="PULP">PULP (Premium)</SelectItem>
                    <SelectItem value="Diesel">Diesel</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="oldPrice">Current Price (¢/L)</Label>
                  <Input id="oldPrice" type="number" step="0.1" value={oldPrice} onChange={(e) => setOldPrice(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <Label htmlFor="newPrice">New Price (¢/L) *</Label>
                  <Input id="newPrice" type="number" step="0.1" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} required placeholder="e.g. 189.9" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="effectiveDate">Effective Date *</Label>
                  <Input id="effectiveDate" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="effectiveTime">Effective Time *</Label>
                  <Input id="effectiveTime" type="time" value={effectiveTime} onChange={(e) => setEffectiveTime(e.target.value)} required />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes or instructions" rows={3} />
              </div>

              <Button type="submit" className="w-full" disabled={loading || !selectedSite || !newPrice}>
                {loading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</>
                  : 'Create & Notify Operators'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" /> Recent Price Changes
            </CardTitle>
            <CardDescription>Latest fuel price updates</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingChanges ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
              </div>
            ) : priceChanges.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Fuel className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>No price changes yet</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {priceChanges.slice(0, 10).map((pc) => (
                    <div key={pc.id} className="p-3 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold">{pc.site?.name}</p>
                          <p className="text-sm text-muted-foreground">{pc.fuel_type}</p>
                        </div>
                        <Badge variant={
                          pc.status === 'acknowledged' ? 'default' :
                          pc.status === 'escalated' ? 'destructive' :
                          pc.status === 'notified' ? 'secondary' : 'outline'
                        }>
                          {pc.status}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-sm">
                        {pc.old_price && <span className="line-through text-muted-foreground">{pc.old_price}¢</span>}
                        <ChevronRight className="h-4 w-4" />
                        <span className="font-bold text-teal-600">{pc.new_price}¢</span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Effective: {new Date(pc.effective_datetime).toLocaleString('en-AU')}
                      </div>
                      {pc.acknowledgements && pc.acknowledgements.length > 0 && (
                        <div className="mt-2 text-xs text-green-600">
                          ✓ {pc.acknowledgements.length} staff acknowledged
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Complete Price Change Log</CardTitle>
          <CardDescription>All price changes with acknowledgement status</CardDescription>
        </CardHeader>
        <CardContent>
          {priceChanges.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No price changes recorded</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left">
                    <th className="p-2">Site</th>
                    <th className="p-2">Fuel Type</th>
                    <th className="p-2">Price Change</th>
                    <th className="p-2">Effective</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Acknowledged</th>
                    <th className="p-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {priceChanges.map((pc) => (
                    <tr key={pc.id} className="border-b hover:bg-slate-50">
                      <td className="p-2">{pc.site?.name}</td>
                      <td className="p-2">{pc.fuel_type}</td>
                      <td className="p-2">
                        {pc.old_price && <span className="line-through text-muted-foreground mr-2">{pc.old_price}¢</span>}
                        <span className="font-semibold">{pc.new_price}¢</span>
                      </td>
                      <td className="p-2 text-xs">{new Date(pc.effective_datetime).toLocaleString('en-AU')}</td>
                      <td className="p-2">
                        <Badge variant={
                          pc.status === 'acknowledged' ? 'default' :
                          pc.status === 'escalated' ? 'destructive' :
                          'secondary'
                        } className="text-xs">
                          {pc.status}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs">
                        {pc.acknowledgements?.length || 0} staff
                      </td>
                      <td className="p-2 text-xs">{new Date(pc.created_at).toLocaleDateString('en-AU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
