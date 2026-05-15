// Pluggable provider factory. Selected at runtime by env var:
//   FUEL_PROVIDER='mock'    (default) → MockProvider
//   FUEL_PROVIDER='qld_fpm'           → QldFpmProvider

import { MockProvider } from './mock-provider';
import { QldFpmProvider } from './qld-fpm-provider';

export function getProvider() {
  const name = (process.env.FUEL_PROVIDER || 'mock').toLowerCase();
  if (name === 'qld_fpm') {
    if (!process.env.FUEL_PRICES_QLD_SUBSCRIBER_TOKEN) {
      console.warn('[fuel-pricing] FUEL_PROVIDER=qld_fpm but FUEL_PRICES_QLD_SUBSCRIBER_TOKEN is missing — falling back to MockProvider so the app still renders.');
      return new MockProvider();
    }
    return new QldFpmProvider();
  }
  return new MockProvider();
}

export function activeProviderLabel() {
  return (process.env.FUEL_PROVIDER || 'mock').toLowerCase();
}
