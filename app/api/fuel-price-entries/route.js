import {
  handleGetFuelPriceEntries, handleCreateFuelPriceEntry,
} from '@/lib/api/handlers/fuel-prices';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const GET = (request) => handleGetFuelPriceEntries(request);
export const POST = (request) => handleCreateFuelPriceEntry(request);
