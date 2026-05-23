import { handleFounderSetup } from '@/lib/api/handlers/founder';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const POST = (request) => handleFounderSetup(request);
