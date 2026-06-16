import { handleGetTanks, handleCreateTank } from '@/lib/api/handlers/tanks';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const GET = (request) => handleGetTanks(request);
export const POST = (request) => handleCreateTank(request);
