import {
  handleGetSiteCompetitors, handleCreateSiteCompetitor,
} from '@/lib/api/handlers/fuel-prices';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const GET = (request) => handleGetSiteCompetitors(request);
export const POST = (request) => handleCreateSiteCompetitor(request);
