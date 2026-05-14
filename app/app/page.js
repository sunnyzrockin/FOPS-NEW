'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Building2, Fuel, ShoppingCart, DollarSign, Droplets, LogOut, FileText, CheckCircle, Clock,
  User, Users, ChevronRight, TrendingUp, BarChart3, Eye, ClipboardList, Loader2, Plus, Settings,
  MapPin, AlertTriangle, Pencil, Trash2, UserPlus, Building, Calculator, Download, Calendar,
  Layers, ChevronDown, ChevronUp, GripVertical, X, Save, RefreshCw, AlertCircle, Mail
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';

// Extracted leaf components (Phase B of dashboard monolith refactor)
import MorningPriceBrief from '@/components/shared/morning-price-brief';
import BankingFormulaBuilder from '@/components/operator/banking/banking-formula-builder';
// Extracted feature managers (Phase C)
import BankingManagement from '@/components/operator/banking/banking-management';
import FieldConfiguration from '@/components/operator/field-configuration';
import OperatorManagement from '@/components/owner/operator-management';
import StaffAccessManagement from '@/components/operator/staff-access-management';
// Extracted shared UI primitives (Phase D)
import Header from '@/components/shared/header';
import StatCard from '@/components/shared/stat-card';
import ViewToggle from '@/components/shared/view-toggle';
import DailyRollupRow from '@/components/shared/daily-rollup-row';
import ReportRow from '@/components/shared/report-row';
import ReportDetail from '@/components/shared/report-detail';
import ExportDialog from '@/components/shared/export-dialog';
// Extracted forms + role wrappers (Phase D Batch 2)
import ShiftReportForm from '@/components/staff/shift-report-form';
import StaffPriceChangeBanner from '@/components/staff/staff-price-change-banner';
import SiteManagement from '@/components/owner/site-management';
// authedFetch helper (used inline below + by extracted components)
import { authedFetch } from '@/lib/authed-fetch';

// Format currency
const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(value || 0);
};

// Format date
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Format datetime
const formatDateTime = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ============== LOGIN PAGE ==============
function LoginPage({ onLogin, loading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please enter email and password'); return; }
    const success = await onLogin(email, password);
    if (!success) { setError('Invalid credentials'); }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/seed-supabase', { method: 'POST' });
      const data = await res.json();
      if (res.ok) { alert(`Supabase database seeded successfully! Check browser console for details.`); }
      else { alert('Seeding failed: ' + (data.error || 'Unknown error')); }
    } catch (err) { alert('Seeding failed: ' + err.message); }
    finally { setSeeding(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Fuel className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">FOPS</CardTitle>
          <CardDescription>Fuel Station Shift Reporting</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="Enter your email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <Button type="submit" className="w-full h-11 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in...</> : 'Sign In'}
            </Button>
          </form>
          <Separator className="my-6" />
        </CardContent>
      </Card>
    </div>
  );
}


// ============== OWNER DASHBOARD ==============
// ============== FUEL PRICE MAP VIEW & COMPARISON ==============
function FuelPriceComparisonSection({ sites, siteIds }) {
  const [viewMode, setViewMode] = useState('map'); // 'map' or 'list'
  const [priceData, setPriceData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const loadPriceData = useCallback(async () => {
    if (!siteIds) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/fuel-price-comparison?siteIds=${siteIds}&date=${selectedDate}`);
      const data = await res.json();
      setPriceData(data);
    } catch (err) { console.error('Failed to load fuel price data:', err); }
    finally { setLoading(false); }
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

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>;
  if (priceData.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2"><Fuel className="h-5 w-5" /> Fuel Price Intelligence</h3>
          <p className="text-sm text-muted-foreground">Compare your fuel prices with nearby competitors</p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={viewMode} onValueChange={setViewMode}>
            <TabsList>
              <TabsTrigger value="map">🗺️ Map View</TabsTrigger>
              <TabsTrigger value="list">📋 List View</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-[180px]" />
        </div>
      </div>

      {viewMode === 'map' ? (
        <FuelPriceMapView sites={sites} priceData={priceData} selectedDate={selectedDate} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(priceData || []).map(site => (
            <Card key={site.site_id} className="border-0 shadow-lg">
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
                        <span className="text-lg font-bold text-blue-600">${(data.own_price / 100).toFixed(1)}</span>
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
      )}
    </div>
  );
}

// Map View Component
function FuelPriceMapView({ sites, priceData, selectedDate }) {
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
        .then(r => r.json())
        .then(data => {
          setCompetitors(data);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load competitors:', err);
          setLoading(false);
        });
    }
  }, [selectedSite]);

  const currentSite = sites.find(s => s.id === selectedSite);
  const currentPriceData = priceData.find(p => p.site_id === selectedSite);

  if (!mounted) return <div className="h-[600px] bg-slate-100 rounded-lg animate-pulse" />;
  
  if (!currentSite) {
    return <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
      <p className="text-muted-foreground">No site data available</p>
    </div>;
  }
  
  if (!currentSite.latitude || !currentSite.longitude) {
    return <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
      <div className="text-center p-8">
        <AlertTriangle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
        <p className="text-lg font-semibold mb-2">Map coordinates not available</p>
        <p className="text-sm text-muted-foreground">
          Site: {currentSite.name}<br/>
          Please use List View instead.
        </p>
      </div>
    </div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={selectedSite} onValueChange={setSelectedSite}>
          <SelectTrigger className="w-[300px]"><SelectValue /></SelectTrigger>
          <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
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
                  {parseFloat(currentPriceData.fuel_data.ULP.difference_from_min || 0) > 0 ? '+' : ''}{currentPriceData.fuel_data.ULP.difference_from_min || '0'}¢
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {loading ? (
        <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <LeafletMapClient currentSite={currentSite} competitors={competitors} priceData={currentPriceData} />
      )}
    </div>
  );
}

// Client-only Leaflet Map Component
function LeafletMapClient({ currentSite, competitors, priceData }) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

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

// Inner map component that only renders client-side
function LeafletMapInner({ currentSite, competitors, priceData }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-[600px] bg-slate-100 rounded-lg flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  try {
    // Import Leaflet and react-leaflet dynamically
    const L = require('leaflet');
    const { MapContainer, TileLayer, Marker, Popup } = require('react-leaflet');

    // Fix default marker icon issue with Leaflet + Webpack
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });

    // Create custom icon
    const createIcon = (isOwn, isLowest) => {
      return L.divIcon({
        className: 'custom-marker',
        html: `<div class="fuel-marker ${isOwn ? 'own' : isLowest ? 'lowest' : 'competitor'}">${isOwn ? '⛽' : '🏪'}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30]
      });
    };

    const lowestCompPrice = priceData?.fuel_data?.ULP?.min_competitor_price || 999999;
    const validCompetitors = competitors.filter(c => c.latitude && c.longitude);

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
            {validCompetitors.map(comp => {
              const compPrice = priceData?.fuel_data?.ULP?.competitor_prices?.find(cp => cp.competitor_name === comp.competitor_name);
              const isLowest = compPrice && compPrice.price === lowestCompPrice;
              
              return (
                <Marker 
                  key={comp.id} 
                  position={[comp.latitude, comp.longitude]} 
                  icon={createIcon(false, isLowest)}
                >
                  <Popup>
                    <div className="p-2 min-w-[200px]">
                      <h3 className="font-bold text-sm mb-2">{comp.competitor_name}</h3>
                      <div className="space-y-1 text-xs">
                        {priceData && Object.entries(priceData.fuel_data).map(([type, data]) => {
                          const price = data.competitor_prices?.find(cp => cp.competitor_name === comp.competitor_name);
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
          <p className="text-xs text-muted-foreground">
            Error: {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }
}

// ============== FUEL PRICING MANAGEMENT (Operator) ==============
// ============== OPERATOR PRICE CHANGE NOTIFICATIONS ==============
function OperatorPriceChangeNotifications({ user, sites }) {
  const [pendingChanges, setPendingChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState(null);
  const [accepting, setAccepting] = useState(null);

  const loadPendingChanges = async () => {
    try {
      const res = await fetch(`/api/fuel-prices/pending?userId=${user.id}&role=operator`);
      const data = await res.json();
      setPendingChanges(data);
    } catch (err) {
      console.error('Failed to load pending changes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingChanges();
    // Poll every 5 minutes
    const interval = setInterval(loadPendingChanges, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user.id]);

  const handleNotifyStaff = async (priceChangeId) => {
    setNotifying(priceChangeId);
    try {
      const res = await fetch(`/api/fuel-prices/${priceChangeId}/notify-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorUserId: user.id })
      });

      if (res.ok) {
        alert('Staff notified successfully!');
        loadPendingChanges();
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (err) {
      alert('Failed to notify staff');
      console.error(err);
    } finally {
      setNotifying(null);
    }
  };

  const handleAcceptPriceChange = async (priceChangeId) => {
    setAccepting(priceChangeId);
    try {
      const res = await authedFetch(`/api/fuel-prices/${priceChangeId}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await loadPendingChanges();
      } else {
        const error = await res.json().catch(() => ({}));
        alert(`Error: ${error.error || 'Failed to accept price change'}`);
      }
    } catch (err) {
      alert('Failed to accept price change');
      console.error(err);
    } finally {
      setAccepting(null);
    }
  };

  const getUrgencyLevel = (priceChange) => {
    if (!priceChange.notifications?.[0]?.staff_notified_at) return 'pending';
    
    const notifiedAt = new Date(priceChange.notifications[0].staff_notified_at);
    const minutesElapsed = (new Date() - notifiedAt) / (1000 * 60);
    
    if (minutesElapsed >= 30) return 'critical';
    if (minutesElapsed >= 15) return 'urgent';
    return 'normal';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-orange-600" />
            Price Change Notifications
          </h2>
          <p className="text-muted-foreground mt-1">Review and notify staff about fuel price changes</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadPendingChanges} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : pendingChanges.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-green-500 opacity-50" />
            <p className="text-lg font-medium">All price changes acknowledged!</p>
            <p className="text-sm text-muted-foreground mt-1">No pending notifications</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pendingChanges.map(pc => {
            const urgency = getUrgencyLevel(pc);
            const isNotified = pc.notifications?.[0]?.staff_notified_at;
            const acknowledgedCount = pc.acknowledgements?.length || 0;

            return (
              <Card key={pc.id} className={`border-2 ${
                urgency === 'critical' ? 'border-red-500 bg-red-50' :
                urgency === 'urgent' ? 'border-orange-500 bg-orange-50' :
                isNotified ? 'border-blue-200' : 'border-slate-300'
              }`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Fuel className={`h-5 w-5 ${
                          urgency === 'critical' ? 'text-red-600' :
                          urgency === 'urgent' ? 'text-orange-600' :
                          'text-blue-600'
                        }`} />
                        {pc.site?.name} - {pc.fuel_type}
                      </CardTitle>
                      <CardDescription className="mt-1">
                        Created by {pc.created_by?.name} • {formatDateTime(pc.created_at)}
                      </CardDescription>
                    </div>
                    <Badge variant={
                      urgency === 'critical' ? 'destructive' :
                      urgency === 'urgent' ? 'secondary' :
                      'outline'
                    } className="ml-2">
                      {urgency === 'critical' ? '🚨 CRITICAL' :
                       urgency === 'urgent' ? '⚠️ URGENT' :
                       isNotified ? '✓ Notified' : 'New'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 p-4 bg-white rounded-lg border">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Current</p>
                      {pc.old_price ? (
                        <p className="text-lg line-through text-muted-foreground">{pc.old_price}¢</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">N/A</p>
                      )}
                    </div>
                    <ChevronRight className="h-6 w-6 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">New Price</p>
                      <p className="text-2xl font-bold text-blue-600">{pc.new_price}¢</p>
                    </div>
                    <Separator orientation="vertical" className="h-12" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground mb-1">Effective</p>
                      <p className="font-medium">{formatDateTime(pc.effective_datetime)}</p>
                    </div>
                  </div>

                  {pc.notes && (
                    <div className="p-3 bg-slate-100 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Notes:</p>
                      <p className="text-sm">{pc.notes}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <div className="text-sm text-muted-foreground">
                      {pc.operator_acked_at && (
                        <span className="text-green-700 font-medium flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" />
                          {pc.operator_user_id === user.id
                            ? `You accepted on ${formatDateTime(pc.operator_acked_at)}`
                            : `Accepted by operator on ${formatDateTime(pc.operator_acked_at)}`}
                        </span>
                      )}
                      {!pc.operator_acked_at && acknowledgedCount > 0 && (
                        <span className="text-green-600 font-medium">
                          ✓ {acknowledgedCount} staff acknowledged
                        </span>
                      )}
                      {urgency === 'critical' && (
                        <span className="text-red-600 font-medium ml-3">
                          ⚠️ Escalated - 30+ min unacknowledged
                        </span>
                      )}
                      {urgency === 'urgent' && (
                        <span className="text-orange-600 font-medium ml-3">
                          ⚠️ Urgent - 15+ min unacknowledged
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Operator Accept button — primary action */}
                      {pc.operator_acked_at ? (
                        <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Accepted
                        </Badge>
                      ) : (
                        <Button
                          onClick={() => handleAcceptPriceChange(pc.id)}
                          disabled={accepting === pc.id}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {accepting === pc.id ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Accepting...</>
                          ) : (
                            <><CheckCircle className="mr-2 h-4 w-4" /> Accept Price Change</>
                          )}
                        </Button>
                      )}

                      {/* Notify Staff button — secondary action */}
                      {isNotified ? (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          Staff notified {formatDateTime(isNotified)}
                        </div>
                      ) : (
                        <Button
                          onClick={() => handleNotifyStaff(pc.id)}
                          disabled={notifying === pc.id}
                          variant="outline"
                        >
                          {notifying === pc.id ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Notifying...</>
                          ) : (
                            <><AlertCircle className="mr-2 h-4 w-4" /> Notify Staff</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}


function FuelPricingManagement({ user, sites }) {
  const [activeSubTab, setActiveSubTab] = useState('notifications');
  
  if (activeSubTab === 'notifications') return <OperatorPriceChangeNotifications user={user} sites={sites} />;
  if (activeSubTab === 'history') return <PriceChangeHistory user={user} sites={sites} />;
  if (activeSubTab === 'prices') return <FuelPriceEntry user={user} sites={sites} />;
  if (activeSubTab === 'competitors') return <CompetitorManagement user={user} sites={sites} />;
  
  return (
    <div className="space-y-6">
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
        <TabsList>
          <TabsTrigger value="notifications">Price Change Notifications</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="prices">Price Entry</TabsTrigger>
          <TabsTrigger value="competitors">Competitors</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

// PriceChangeHistory — Owner / Operator view of recent fuel price changes
// with their operator-acceptance status. Uses GET /api/fuel-prices/history.
function PriceChangeHistory({ user, sites }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(14);
  const [siteFilter, setSiteFilter] = useState('all');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ days: String(days) });
      if (siteFilter !== 'all') q.set('siteId', siteFilter);
      const res = await authedFetch(`/api/fuel-prices/history?${q.toString()}`);
      if (!res.ok) {
        if (res.status === 401) {
          if (typeof window !== 'undefined') window.location.href = '/login';
          return;
        }
        const err = await res.json().catch(() => ({}));
        console.warn('history load failed:', err);
        setRows([]);
        return;
      }
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('history load error:', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [days, siteFilter]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Price Change History</h2>
          <p className="text-muted-foreground">Recent fuel price changes and their acknowledgment status.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v, 10))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadHistory} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading history...
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No fuel price changes in the selected window.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Site</th>
                    <th className="px-4 py-3">Fuel</th>
                    <th className="px-4 py-3">Price Change</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Operator Status</th>
                    <th className="px-4 py-3">Staff Acks</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((pc) => {
                    const diff = pc.price_change;
                    const diffColor = diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : '';
                    const diffSign = diff > 0 ? '+' : '';
                    const statusVariant = pc.status === 'escalated' ? 'destructive'
                      : pc.status === 'acknowledged' ? 'default' : 'secondary';
                    const acceptedSummaryClass = pc.operator_acked_at
                      ? 'text-green-700 font-medium' : 'text-muted-foreground';
                    return (
                      <tr key={pc.id} className="border-t">
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(pc.created_at)}</td>
                        <td className="px-4 py-3">{pc.site_name || pc.site_id}</td>
                        <td className="px-4 py-3 font-medium">{pc.fuel_type}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="text-muted-foreground">{pc.old_price}</span>
                          <span className="mx-1">→</span>
                          <span className="font-semibold">{pc.new_price}</span>
                          {diff !== null && (
                            <span className={`ml-2 text-xs ${diffColor}`}>({diffSign}{diff})</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={statusVariant}>{pc.status}</Badge>
                        </td>
                        <td className={`px-4 py-3 max-w-xs ${acceptedSummaryClass}`}>
                          {pc.acknowledgment_summary}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {pc.staff_ack_count > 0 ? (
                            <span className="text-green-700">✓ {pc.staff_ack_count}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FuelPriceEntry({ user, sites }) {
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [prices, setPrices] = useState({ ULP: '', Diesel: '', Premium: '' });
  const [competitorPrices, setCompetitorPrices] = useState({});
  const [competitors, setCompetitors] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedSite) {
      fetch(`/api/site-competitors?siteId=${selectedSite}`)
        .then(r => r.json())
        .then(setCompetitors);
    }
  }, [selectedSite]);

  const handleSavePrices = async () => {
    setLoading(true);
    try {
      for (const [fuelType, price] of Object.entries(prices)) {
        if (price) {
          await fetch('/api/fuel-price-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              site_id: selectedSite,
              fuel_type: fuelType,
              own_price: parseFloat(price),
              date: selectedDate,
              entered_by_user_id: user.id
            })
          });
        }
      }
      
      for (const [key, price] of Object.entries(competitorPrices)) {
        if (price) {
          const [compName, fuelType] = key.split('_');
          await fetch('/api/competitor-prices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              site_id: selectedSite,
              competitor_name: compName,
              fuel_type: fuelType,
              price: parseFloat(price),
              recorded_at: selectedDate,
              entered_by_user_id: user.id
            })
          });
        }
      }
      
      alert('Prices saved successfully!');
      setPrices({ ULP: '', Diesel: '', Premium: '' });
      setCompetitorPrices({});
    } catch (err) { alert('Failed to save prices'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div><h2 className="text-xl font-bold">Fuel Price Entry</h2><p className="text-muted-foreground">Enter your fuel prices and competitor prices</p></div>
      
      <div className="flex gap-4">
        <Select value={selectedSite} onValueChange={setSelectedSite}>
          <SelectTrigger className="w-[250px]"><SelectValue /></SelectTrigger>
          <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-[180px]" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Your Prices</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {['ULP', 'Diesel', 'Premium'].map(ft => (
            <div key={ft} className="flex items-center gap-3">
              <Label className="w-24">{ft}</Label>
              <Input type="number" step="0.1" placeholder="185.9" value={prices[ft]} onChange={(e) => setPrices(p => ({ ...p, [ft]: e.target.value }))} className="w-32" />
              <span className="text-xs text-muted-foreground">cents/litre</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {competitors.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Competitor Prices</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {competitors.map(comp => (
              <div key={comp.id} className="space-y-2 p-3 bg-slate-50 rounded">
                <p className="font-medium text-sm">{comp.competitor_name}</p>
                <div className="grid grid-cols-3 gap-3">
                  {['ULP', 'Diesel', 'Premium'].map(ft => (
                    <Input key={ft} type="number" step="0.1" placeholder={ft} value={competitorPrices[`${comp.competitor_name}_${ft}`] || ''} onChange={(e) => setCompetitorPrices(p => ({ ...p, [`${comp.competitor_name}_${ft}`]: e.target.value }))} className="text-sm" />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Button onClick={handleSavePrices} disabled={loading} className="w-full">{loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <><Save className="h-4 w-4 mr-2" /> Save All Prices</>}</Button>
    </div>
  );
}

function CompetitorManagement({ user, sites }) {
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || '');
  const [competitors, setCompetitors] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ competitor_name: '', distance_km: '' });

  const loadCompetitors = useCallback(async () => {
    if (!selectedSite) return;
    const res = await fetch(`/api/site-competitors?siteId=${selectedSite}`);
    const data = await res.json();
    setCompetitors(data);
  }, [selectedSite]);

  useEffect(() => { loadCompetitors(); }, [loadCompetitors]);

  const handleAdd = async () => {
    if (!form.competitor_name) { alert('Competitor name required'); return; }
    await fetch('/api/site-competitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, site_id: selectedSite })
    });
    setForm({ competitor_name: '', distance_km: '' });
    setShowAdd(false);
    loadCompetitors();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this competitor?')) return;
    await fetch(`/api/site-competitors/${id}`, { method: 'DELETE' });
    loadCompetitors();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold">Manage Competitors</h2><p className="text-muted-foreground">Add and manage nearby competitor stations</p></div>
        <Select value={selectedSite} onValueChange={setSelectedSite}>
          <SelectTrigger className="w-[250px]"><SelectValue /></SelectTrigger>
          <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Add Competitor</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Competitor</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Competitor Name</Label><Input placeholder="Shell Petrol Station" value={form.competitor_name} onChange={(e) => setForm(p => ({ ...p, competitor_name: e.target.value }))} className="mt-1" /></div>
            <div><Label>Distance (km)</Label><Input type="number" step="0.1" placeholder="1.5" value={form.distance_km} onChange={(e) => setForm(p => ({ ...p, distance_km: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter><DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose><Button onClick={handleAdd}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="pt-6">
          {competitors.length === 0 ? <p className="text-center text-muted-foreground py-8">No competitors added yet</p> : (
            <div className="space-y-2">
              {competitors.map(comp => (
                <div key={comp.id} className="flex items-center justify-between p-3 bg-slate-50 rounded">
                  <div>
                    <p className="font-medium">{comp.competitor_name}</p>
                    {comp.distance_km && <p className="text-xs text-muted-foreground">{comp.distance_km} km away</p>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(comp.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============== FUEL PRICE MANAGEMENT (OWNER) ==============
function OwnerFuelPriceManagement({ user, sites }) {
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

  useEffect(() => {
    loadPriceChanges();
  }, []);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const effectiveDatetime = `${effectiveDate}T${effectiveTime}:00`;
      
      const res = await authedFetch('/api/fuel-prices', {
        method: 'POST',
        body: JSON.stringify({
          siteId: selectedSite,
          fuelType,
          oldPrice: oldPrice ? parseFloat(oldPrice) : null,
          newPrice: parseFloat(newPrice),
          effectiveDatetime,
          createdByUserId: user.id,
          notes
        })
      });

      if (res.ok) {
        alert('Price change created and operators notified!');
        setSelectedSite('');
        setOldPrice('');
        setNewPrice('');
        setNotes('');
        loadPriceChanges();
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (err) {
      alert('Failed to create price change');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Fuel className="h-6 w-6 text-blue-600" />
          Fuel Price Management
        </h1>
        <p className="text-muted-foreground mt-1">Create and track fuel price changes across your sites</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create Price Change
            </CardTitle>
            <CardDescription>Enter new fuel price to notify operators and staff</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="site">Site *</Label>
                <Select value={selectedSite} onValueChange={setSelectedSite} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map(site => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name} ({site.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="fuelType">Fuel Type *</Label>
                <Select value={fuelType} onValueChange={setFuelType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  <Input
                    id="oldPrice"
                    type="number"
                    step="0.1"
                    value={oldPrice}
                    onChange={(e) => setOldPrice(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label htmlFor="newPrice">New Price (¢/L) *</Label>
                  <Input
                    id="newPrice"
                    type="number"
                    step="0.1"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    required
                    placeholder="e.g. 189.9"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="effectiveDate">Effective Date *</Label>
                  <Input
                    id="effectiveDate"
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="effectiveTime">Effective Time *</Label>
                  <Input
                    id="effectiveTime"
                    type="time"
                    value={effectiveTime}
                    onChange={(e) => setEffectiveTime(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes or instructions"
                  rows={3}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading || !selectedSite || !newPrice}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : 'Create & Notify Operators'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Price Changes
            </CardTitle>
            <CardDescription>Latest fuel price updates</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingChanges ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : priceChanges.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Fuel className="h-12 w-12 mx-auto mb-2 opacity-20" />
                <p>No price changes yet</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-3">
                  {priceChanges.slice(0, 10).map(pc => (
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
                        <span className="font-bold text-blue-600">{pc.new_price}¢</span>
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
                  {priceChanges.map(pc => (
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


// ============== OWNER DASHBOARD ==============
function OwnerDashboard({ user, sites, activeTab, onRefreshSites }) {
  const [stats, setStats] = useState(null);
  const [dailyRollups, setDailyRollups] = useState([]);
  const [shiftReports, setShiftReports] = useState([]);
  const [siteStats, setSiteStats] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [viewType, setViewType] = useState('daily');
  const [expandedRollup, setExpandedRollup] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(true);

  const siteIds = sites.map(s => s.id).join(',');

  const loadData = useCallback(async () => {
    if (!siteIds) { setLoading(false); return; }
    setLoading(true);
    try {
      const [statsRes, dailyRes, shiftsRes, siteStatsRes, chartRes] = await Promise.all([
        fetch(`/api/dashboard/stats?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/daily-rollups?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        authedFetch(`/api/reports?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/dashboard/site-stats?siteIds=${siteIds}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/dashboard/revenue-chart?siteIds=${siteIds}&days=7`)
      ]);
      
      const [statsData, dailyData, shiftsData, siteStatsData, chartDataRes] = await Promise.all([
        statsRes.json(), dailyRes.json(), shiftsRes.json(), siteStatsRes.json(), chartRes.json()
      ]);
      
      setStats(statsData);
      setDailyRollups(dailyData);
      setShiftReports(shiftsData);
      setSiteStats(siteStatsData);
      setChartData(chartDataRes);
    } catch (err) { console.error('Failed to load data:', err); }
    finally { setLoading(false); }
  }, [siteIds, dateRange]);

  useEffect(() => { if (activeTab === 'dashboard') loadData(); }, [loadData, activeTab]);

  const handleReportClick = async (reportId) => {
    const res = await fetch(`/api/reports/${reportId}`);
    const data = await res.json();
    setSelectedReport(data);
  };

  // Sites Tab
  if (activeTab === 'sites') {
    return <div className="container mx-auto px-4 py-6"><SiteManagement user={user} sites={sites} onRefresh={onRefreshSites} /></div>;
  }

  // Operators Tab (Owner manages operators only)
  if (activeTab === 'operators') {
    return <div className="container mx-auto px-4 py-6"><OperatorManagement user={user} sites={sites} onRefresh={onRefreshSites} /></div>;
  }

  // Fuel Prices Tab
  if (activeTab === 'fuel-prices') {
    return <OwnerFuelPriceManagement user={user} sites={sites} />;
  }

  // Report Detail
  if (selectedReport) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <ReportDetail report={selectedReport} onClose={() => setSelectedReport(null)} canChangeStatus={false} user={user} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Filters */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="w-[150px]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="w-[150px]" />
              </div>
              <Button variant="outline" size="sm" onClick={loadData}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
            </div>
            <div className="flex items-center gap-3">
              <ViewToggle viewType={viewType} setViewType={setViewType} />
              <ExportDialog sites={sites} siteIds={siteIds} />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
      ) : (
        <>
          {/* Morning Price Brief Panel */}
          <Card className="border-0 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Fuel className="h-5 w-5" /> Morning Price Brief
              </CardTitle>
              <CardDescription>Quick pricing overview across all your sites</CardDescription>
            </CardHeader>
            <CardContent>
              <MorningPriceBrief sites={sites} selectedDate={dateRange.to} />
            </CardContent>
          </Card>

          {/* Stats Cards */}
          {stats && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                <StatCard title="Total Shop Sales" value={formatCurrency(stats.totalShopSales)} icon={ShoppingCart} subValue={`${stats.totalReports} reports`} color="green" />
                <StatCard title="Total Fuel Sales" value={formatCurrency(stats.totalFuelSales)} icon={Fuel} color="blue" />
                <StatCard title="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} color="purple" />
                <StatCard title="Total Dips" value={formatCurrency(stats.totalDips)} icon={Droplets} color="cyan" />
                <StatCard title="Drive Offs" value={formatCurrency(stats.totalDriveOffs)} icon={AlertTriangle} color="red" />
                <StatCard title="Banking" value={formatCurrency(stats.totalBanking)} icon={Calculator} color="orange" />
              </div>
              
              {/* Top/Lowest Performing Sites */}
              {(stats.topPerformingSite || stats.lowestPerformingSite) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {stats.topPerformingSite && (
                    <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-green-600 mb-1">🏆 Top Performing Site</p>
                            <h3 className="text-xl font-bold text-gray-900">{stats.topPerformingSite.siteName}</h3>
                            <p className="text-sm text-gray-500">{stats.topPerformingSite.siteCode}</p>
                            <p className="text-2xl font-bold text-green-600 mt-3">{formatCurrency(stats.topPerformingSite.revenue)}</p>
                            <p className="text-xs text-gray-500">Total Revenue</p>
                          </div>
                          <TrendingUp className="h-8 w-8 text-green-500" />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {stats.lowestPerformingSite && (
                    <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-50 to-amber-50">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-orange-600 mb-1">📊 Lowest Performing Site</p>
                            <h3 className="text-xl font-bold text-gray-900">{stats.lowestPerformingSite.siteName}</h3>
                            <p className="text-sm text-gray-500">{stats.lowestPerformingSite.siteCode}</p>
                            <p className="text-2xl font-bold text-orange-600 mt-3">{formatCurrency(stats.lowestPerformingSite.revenue)}</p>
                            <p className="text-xs text-gray-500">Total Revenue</p>
                          </div>
                          <AlertCircle className="h-8 w-8 text-orange-500" />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </>
          )}
          
          {/* Fuel Price Comparison Section */}
          <FuelPriceComparisonSection sites={sites} siteIds={siteIds} />
          
          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-lg">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Revenue Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} className="text-xs" />
                    <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} className="text-xs" />
                    <Tooltip formatter={(value) => formatCurrency(value)} labelFormatter={(d) => formatDate(d)} />
                    <Line type="monotone" dataKey="revenue" stroke="url(#colorRevenue)" strokeWidth={3} dot={false} />
                    <defs><linearGradient id="colorRevenue" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#8b5cf6" /></linearGradient></defs>
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            
            <Card className="border-0 shadow-lg">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Site Comparison</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={siteStats}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="siteCode" className="text-xs" />
                    <YAxis tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} className="text-xs" />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="fuelSales" name="Fuel" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="shopSales" name="Shop" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          
          {/* Reports */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {viewType === 'daily' ? <Calendar className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                {viewType === 'daily' ? 'Daily Summaries' : 'Shift Reports'}
              </CardTitle>
              <CardDescription>
                {stats?.pendingReports || 0} pending • {stats?.reviewedReports || 0} reviewed
              </CardDescription>
            </CardHeader>
            <CardContent>
              {viewType === 'daily' ? (
                <div className="space-y-4">
                  {dailyRollups.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No reports found</p>
                  ) : (
                    dailyRollups.map(rollup => (
                      <DailyRollupRow
                        key={`${rollup.site_id}_${rollup.date}`}
                        rollup={rollup}
                        onClick={handleReportClick}
                        expanded={expandedRollup === `${rollup.site_id}_${rollup.date}`}
                        onToggle={() => setExpandedRollup(expandedRollup === `${rollup.site_id}_${rollup.date}` ? null : `${rollup.site_id}_${rollup.date}`)}
                      />
                    ))
                  )}
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {shiftReports.map(report => (
                      <ReportRow key={report.id} report={report} onClick={() => handleReportClick(report.id)} />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ============== OPERATOR DASHBOARD ==============
function OperatorDashboard({ user, sites, activeTab }) {
  const [reports, setReports] = useState([]);
  const [dailyRollups, setDailyRollups] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [viewType, setViewType] = useState('daily');
  const [expandedRollup, setExpandedRollup] = useState(null);
  const [selectedSite, setSelectedSite] = useState('all');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(true);

  const siteIds = sites.map(s => s.id).join(',');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const siteFilter = selectedSite === 'all' ? siteIds : selectedSite;
      const [reportsRes, dailyRes, statsRes] = await Promise.all([
        authedFetch(`/api/reports?siteIds=${siteFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/daily-rollups?siteIds=${siteFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}`),
        fetch(`/api/dashboard/stats?siteIds=${siteFilter}&startDate=${dateRange.start}&endDate=${dateRange.end}`)
      ]);
      const [reportsData, dailyData, statsData] = await Promise.all([reportsRes.json(), dailyRes.json(), statsRes.json()]);
      setReports(reportsData);
      setDailyRollups(dailyData);
      setStats(statsData);
    } catch (err) { console.error('Failed to load data:', err); }
    finally { setLoading(false); }
  }, [selectedSite, dateRange, siteIds]);

  useEffect(() => { if (activeTab === 'dashboard') loadData(); }, [loadData, activeTab]);

  const handleStatusChange = async (reportId, status, reviewedBy) => {
    await fetch(`/api/reports/${reportId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, reviewed_by_user_id: reviewedBy }) });
    setSelectedReport(prev => prev ? { ...prev, status, reviewed_by_user_id: reviewedBy } : null);
    loadData();
  };

  const handleReportClick = async (reportId) => {
    const res = await fetch(`/api/reports/${reportId}`);
    const data = await res.json();
    setSelectedReport(data);
  };

  if (activeTab === 'staff') { return <div className="container mx-auto px-4 py-6"><StaffAccessManagement user={user} sites={sites} /></div>; }
  if (activeTab === 'pricing') { return <div className="container mx-auto px-4 py-6"><FuelPricingManagement user={user} sites={sites} /></div>; }
  if (activeTab === 'fields') { return <div className="container mx-auto px-4 py-6"><FieldConfiguration user={user} sites={sites} /></div>; }
  if (activeTab === 'banking') { return <div className="container mx-auto px-4 py-6"><BankingManagement user={user} sites={sites} /></div>; }
  if (selectedReport) { return <div className="container mx-auto px-4 py-6 max-w-4xl"><ReportDetail report={selectedReport} onClose={() => setSelectedReport(null)} onStatusChange={handleStatusChange} canChangeStatus={true} user={user} /></div>; }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-4">
              <Select value={selectedSite} onValueChange={setSelectedSite}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">All Sites</SelectItem>{sites.map(site => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="date" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="w-[150px]" />
              <Input type="date" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="w-[150px]" />
            </div>
            <div className="flex items-center gap-3">
              <ViewToggle viewType={viewType} setViewType={setViewType} />
              <ExportDialog sites={sites} siteIds={siteIds} />
            </div>
          </div>
        </CardContent>
      </Card>
      
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Shop Sales" value={formatCurrency(stats.totalShopSales)} icon={ShoppingCart} color="green" />
          <StatCard title="Fuel Sales" value={formatCurrency(stats.totalFuelSales)} icon={Fuel} color="blue" />
          <StatCard title="Total Revenue" value={formatCurrency(stats.totalRevenue)} icon={DollarSign} color="purple" />
          <StatCard title="Dips" value={formatCurrency(stats.totalDips)} icon={Droplets} color="cyan" />
          <StatCard title="Drive Offs" value={formatCurrency(stats.totalDriveOffs)} icon={AlertTriangle} color="red" />
        </div>
      )}
      
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle>{viewType === 'daily' ? 'Daily Summaries' : 'Shift Reports'}</CardTitle>
          <CardDescription>{stats?.pendingReports || 0} pending • {stats?.reviewedReports || 0} reviewed</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div> : viewType === 'daily' ? (
            <div className="space-y-4">
              {dailyRollups.length === 0 ? <p className="text-center text-muted-foreground py-8">No reports found</p> : dailyRollups.map(rollup => (
                <DailyRollupRow key={`${rollup.site_id}_${rollup.date}`} rollup={rollup} onClick={handleReportClick} expanded={expandedRollup === `${rollup.site_id}_${rollup.date}`} onToggle={() => setExpandedRollup(expandedRollup === `${rollup.site_id}_${rollup.date}` ? null : `${rollup.site_id}_${rollup.date}`)} />
              ))}
            </div>
          ) : (
            <ScrollArea className="h-[400px]"><div className="space-y-2">{reports.map(report => <ReportRow key={report.id} report={report} onClick={() => handleReportClick(report.id)} />)}</div></ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============== STAFF DASHBOARD ==============

function StaffDashboard({ user, sites, activeTab }) {
  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    try {
      // Staff view: backend derives scope from the JWT (returns only this
      // user's submitted reports). No need to send userId in the query.
      const res = await authedFetch('/api/reports');
      const data = await res.json();
      setReports(Array.isArray(data) ? data : []);
    } catch (err) { console.error('Failed to load reports:', err); }
    finally { setLoading(false); }
  }, [user.id]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleReportClick = async (report) => {
    const res = await fetch(`/api/reports/${report.id}`);
    const data = await res.json();
    setSelectedReport(data);
  };

  if (selectedReport) { return <div className="container mx-auto px-4 py-6 max-w-4xl"><ReportDetail report={selectedReport} onClose={() => setSelectedReport(null)} canChangeStatus={false} user={user} /></div>; }

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Price Change Banner */}
      <StaffPriceChangeBanner user={user} />
      
      {activeTab === 'submit' && <ShiftReportForm user={user} sites={sites} onSuccess={loadReports} />}
      {activeTab === 'history' && (
        <Card className="border-0 shadow-lg">
          <CardHeader><CardTitle>My Submitted Reports</CardTitle><CardDescription>View your recent shift report submissions</CardDescription></CardHeader>
          <CardContent>
            {loading ? <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div> : reports.length === 0 ? <p className="text-center text-muted-foreground py-8">No reports submitted yet</p> : (
              <ScrollArea className="h-[400px]"><div className="space-y-2">{reports.map(report => <ReportRow key={report.id} report={report} onClick={() => handleReportClick(report)} />)}</div></ScrollArea>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============== MAIN APP ==============
export default function App() {
  const router = useRouter();
  
  // Start with null to avoid hydration mismatch
  const [user, setUser] = useState(null);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mounted, setMounted] = useState(false);
  const [hasRedirected, setHasRedirected] = useState(false);

  // Initialize from localStorage only on client side (runs once on mount)
  useEffect(() => {
    const savedUser = localStorage.getItem('workflowlite_user');
    const savedSites = localStorage.getItem('workflowlite_sites');
    
    if (savedUser && savedSites) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        setSites(JSON.parse(savedSites));
        setActiveTab(parsedUser.role === 'staff' ? 'submit' : 'dashboard');
        setMounted(true);
      } catch (e) {
        // Invalid data in localStorage
        console.error('Failed to parse user data:', e);
        localStorage.removeItem('workflowlite_user');
        localStorage.removeItem('workflowlite_sites');
        if (!hasRedirected) {
          setHasRedirected(true);
          router.replace('/login');
        }
      }
    } else {
      // No user data, redirect to login (only once)
      if (!hasRedirected) {
        setHasRedirected(true);
        router.replace('/login');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty array - run only once on mount

  // Global escalation polling - runs every 5 minutes
  useEffect(() => {
    if (!mounted || !user) return;

    const checkEscalations = async () => {
      try {
        await fetch('/api/fuel-prices/escalate', { method: 'POST' });
      } catch (err) {
        console.error('Escalation check failed:', err);
      }
    };

    // Run immediately on mount
    checkEscalations();

    // Then every 5 minutes
    const interval = setInterval(checkEscalations, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [mounted, user]);


  const handleLogin = async (email, password) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSites(data.sites);
        setActiveTab(data.user.role === 'staff' ? 'submit' : 'dashboard');
        localStorage.setItem('workflowlite_user', JSON.stringify(data.user));
        localStorage.setItem('workflowlite_sites', JSON.stringify(data.sites));
        return true;
      }
      return false;
    } catch (err) { console.error('Login failed:', err); return false; }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    // 1) Clear local state + localStorage IMMEDIATELY so UI never hangs.
    try {
      setUser(null);
      setSites([]);
      localStorage.removeItem('workflowlite_user');
      localStorage.removeItem('workflowlite_sites');
    } catch {}

    // 2) Best-effort: sign out of Supabase + clear server session. Don't
    //    block on these — the redirect must happen even if they fail.
    try {
      // Fire-and-forget; capped at ~2s so a slow API never delays the user.
      const supabasePromise = (async () => {
        try {
          const { createBrowserClient } = await import('@/lib/supabase');
          const sb = createBrowserClient();
          await sb.auth.signOut();
        } catch {}
      })();
      const apiPromise = fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      Promise.race([
        Promise.allSettled([supabasePromise, apiPromise]),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]).finally(() => {});
    } catch {}

    // 3) Redirect immediately. window.location.href forces a full reload so
    //    every piece of React state, cached fetches, and stale auth tokens
    //    are flushed.
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  const refreshSites = async () => {
    if (!user) return;
    try {
      const res = await authedFetch('/api/sites');
      const data = await res.json();
      setSites(Array.isArray(data) ? data : []);
      if (Array.isArray(data)) {
        localStorage.setItem('workflowlite_sites', JSON.stringify(data));
      }
    } catch (err) { console.error('Failed to refresh sites:', err); }
  };

  // Show loading while initializing and redirecting  
  if (!mounted || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Header user={user} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab} />
      {user.role === 'staff' && <StaffDashboard user={user} sites={sites} activeTab={activeTab} />}
      {user.role === 'operator' && <OperatorDashboard user={user} sites={sites} activeTab={activeTab} />}
      {user.role === 'owner' && <OwnerDashboard user={user} sites={sites} activeTab={activeTab} onRefreshSites={refreshSites} />}
    </div>
  );
}
