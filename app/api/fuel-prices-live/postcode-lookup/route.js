import { handleGetPostcodeLookup } from '@/lib/api/handlers/postcode-lookup';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const OPTIONS = optionsHandler;
export async function GET(request) { return handleGetPostcodeLookup(request); }
