import { handleUpdateFuelPriceEntry } from '@/lib/api/handlers/fuel-prices';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const PUT = async (request, { params }) => {
  const { id } = await params;
  return handleUpdateFuelPriceEntry(id, request);
};
