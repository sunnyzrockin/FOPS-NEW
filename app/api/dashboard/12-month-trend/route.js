import { handleTwelveMonthTrend } from '@/lib/api/handlers/executive-dashboard';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const GET = (request) => handleTwelveMonthTrend(request);
