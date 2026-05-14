'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Fuel, ChevronRight, CheckCircle, Clock } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * StaffPriceChangeBanner — Pinned banner on the Staff dashboard listing all
 * pending fuel-price changes for the staff member's assigned sites. Polls
 * /api/fuel-prices/pending every 5 minutes. Includes an "Acknowledge" CTA
 * that posts to the Bearer-locked acknowledge endpoint (user identity
 * pulled from JWT, not from request body).
 *
 * Extracted from /app/app/app/page.js as Phase D of the dashboard monolith
 * refactor. Behaviour unchanged.
 */
export default function StaffPriceChangeBanner({ user }) {
  const [pendingChanges, setPendingChanges] = useState([]);
  const [acknowledging, setAcknowledging] = useState(null);

  const loadPendingChanges = async () => {
    try {
      const res = await fetch(`/api/fuel-prices/pending?userId=${user.id}&role=staff`);
      const data = await res.json();
      setPendingChanges(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load pending price changes:', err);
    }
  };

  useEffect(() => {
    loadPendingChanges();
    // Poll every 5 minutes
    const interval = setInterval(loadPendingChanges, 5 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const handleAcknowledge = async (priceChangeId) => {
    setAcknowledging(priceChangeId);
    try {
      const res = await authedFetch(`/api/fuel-prices/${priceChangeId}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({}),
      });

      if (res.ok) {
        loadPendingChanges();
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (err) {
      alert('Failed to acknowledge');
      console.error(err);
    } finally {
      setAcknowledging(null);
    }
  };

  const getUrgencyLevel = (priceChange) => {
    const notifiedAt = priceChange.notifications?.[0]?.staff_notified_at;
    if (!notifiedAt) return 'normal';
    const minutesElapsed = (new Date() - new Date(notifiedAt)) / (1000 * 60);
    if (minutesElapsed >= 15) return 'urgent';
    return 'normal';
  };

  if (pendingChanges.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      {pendingChanges.map((pc) => {
        const urgency = getUrgencyLevel(pc);
        const isUrgent = urgency === 'urgent';

        return (
          <div
            key={pc.id}
            className={`p-4 rounded-lg border-2 ${
              isUrgent ? 'bg-red-50 border-red-500 shadow-lg' : 'bg-yellow-50 border-yellow-500'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Fuel className={`h-5 w-5 ${isUrgent ? 'text-red-600' : 'text-yellow-700'}`} />
                  <h3 className={`font-bold text-lg ${isUrgent ? 'text-red-900' : 'text-yellow-900'}`}>
                    {isUrgent && '🚨 URGENT: '}
                    Fuel Price Change - {pc.site?.name}
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Fuel Type</p>
                    <p className="font-semibold">{pc.fuel_type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">New Price</p>
                    <div className="flex items-center gap-2">
                      {pc.old_price && (
                        <>
                          <span className="line-through text-muted-foreground">{pc.old_price}¢</span>
                          <ChevronRight className="h-4 w-4" />
                        </>
                      )}
                      <span className="text-xl font-bold text-blue-600">{pc.new_price}¢/L</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Effective</p>
                    <p className="font-medium">{formatDateTime(pc.effective_datetime)}</p>
                  </div>
                </div>

                {pc.notes && (
                  <div className="mb-3 p-2 bg-white/50 rounded">
                    <p className="text-sm"><strong>Note:</strong> {pc.notes}</p>
                  </div>
                )}

                {pc.operator_acked_at ? (
                  <div className="mb-3 p-2 rounded bg-green-100 border border-green-300 text-green-900 text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Accepted by {pc.operator_acked_by?.name || 'Operator'} on {formatDateTime(pc.operator_acked_at)}
                  </div>
                ) : (
                  <div className="mb-3 p-2 rounded bg-amber-100 border border-amber-300 text-amber-900 text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Waiting for operator acceptance
                  </div>
                )}

                {isUrgent && (
                  <p className="text-sm text-red-700 font-medium">
                    ⚠️ This price change was notified over 15 minutes ago. Please acknowledge immediately!
                  </p>
                )}
              </div>

              <Button
                onClick={() => handleAcknowledge(pc.id)}
                disabled={acknowledging === pc.id}
                className={isUrgent ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'}
                size="lg"
              >
                {acknowledging === pc.id ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Acknowledging...</>
                ) : (
                  <><CheckCircle className="mr-2 h-5 w-5" /> Acknowledge</>
                )}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
