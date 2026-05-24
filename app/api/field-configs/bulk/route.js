import { handleBulkUpdateFieldConfigs } from '@/lib/api/handlers/field-configs';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const POST = (request) => handleBulkUpdateFieldConfigs(request);
