import { handlePivot } from '@/lib/api/handlers/reports-pivot';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const OPTIONS = optionsHandler;
export async function GET(request) { return handlePivot(request); }
