'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OperatorPriceChangeNotifications from './operator-price-change-notifications';
import PriceChangeHistory from './price-change-history';
import FuelPriceEntry from './fuel-price-entry';
import CompetitorManagement from './competitor-management';

/**
 * FuelPricingManagement — Operator-facing Fuel Pricing tab wrapper. Hosts
 * 4 sub-tabs: Notifications, History, Price Entry, Competitors. Extracted
 * from /app/app/app/page.js.
 */
export default function FuelPricingManagement({ user, sites }) {
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
