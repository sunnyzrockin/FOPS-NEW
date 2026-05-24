import { handleGetDashboardRevenueChart } from '@/lib/api/handlers/dashboard';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const GET = (request) => handleGetDashboardRevenueChart(request);
