import {
  handleGetFieldConfigs,
  handleCreateFieldConfig,
} from '@/lib/api/handlers/field-configs';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const GET = (request) => handleGetFieldConfigs(request);
export const POST = (request) => handleCreateFieldConfig(request);
