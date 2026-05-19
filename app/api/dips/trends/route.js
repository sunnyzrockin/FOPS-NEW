import { handleGetDipsTrends } from '@/lib/api/handlers/dips';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const OPTIONS = optionsHandler;
export async function GET(request) { return handleGetDipsTrends(request); }
