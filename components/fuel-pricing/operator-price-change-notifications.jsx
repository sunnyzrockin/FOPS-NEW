'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle, Loader2, Fuel, ChevronRight, CheckCircle, RefreshCw,
} from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { authedFetch } from '@/lib/authed-fetch';

import { toast } from 'sonner';
/**
 * OperatorPriceChangeNotifications — Operator-facing list of pending fuel
 * price changes for their assigned sites. Operators can "Accept Price
 * Change" (operator-level acknowledgement) and "Notify Staff" (kicks off
 * staff banner + email). Polls /api/fuel-prices/pending every 5 minutes.
 * Extracted from /app/app/app/page.js.
 */
export default function OperatorPriceChangeNotifications({ user, sites }) {
  // eslint-disable-next-line no-unused-vars
  const _sites = sites; // referenced by callers; not needed here
  const [pendingChanges, setPendingChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState(null);
  const [accepting, setAccepting] = useState(null);

  const loadPendingChanges = async () => {
    try {
      const res = await fetch(`/api/fuel-prices/pending?userId=${user.id}&role=operator`);
      const data = await res.json();
      setPendingChanges(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load pending changes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingChanges();
    const interval = setInterval(loadPendingChanges, 5 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const handleNotifyStaff = async (priceChangeId) => {
    setNotifying(priceChangeId);
    try {
      const res = await fetch(`/api/fuel-prices/${priceChangeId}/notify-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorUserId: user.id }),
      });
      if (res.ok) {
        toast.success('Staff notified successfully!');
        loadPendingChanges();
      } else {
        const error = await res.json();
        toast.error(`Error: ${error.error}`);
      }
    } catch (err) {
      toast.error('Failed to notify staff');
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
        toast.error(`Error: ${error.error || 'Failed to accept price change'}`);
      }
    } catch (err) {
      toast.error('Failed to accept price change');
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
          {pendingChanges.map((pc) => {
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
                      {pc.operator_acked_at ? (
                        <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                          <CheckCircle className="h-3 w-3 mr-1" /> Accepted
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
