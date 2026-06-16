import { handleGetRedTanksToday } from '@/lib/api/handlers/tank-reconciliation';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const GET = (request) => handleGetRedTanksToday(request);
