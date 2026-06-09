import { handleTimeseries } from '@/lib/api/handlers/timeseries';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;

export async function GET(request) {
  return handleTimeseries(request);
}
