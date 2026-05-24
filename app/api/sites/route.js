import { handleGetSites, handleCreateSite } from '@/lib/api/handlers/sites';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const GET = (request) => handleGetSites(request);
export const POST = (request) => handleCreateSite(request);
