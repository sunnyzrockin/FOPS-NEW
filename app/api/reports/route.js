import {
  handleGetReports, handleCreateReport,
} from '@/lib/api/handlers/reports';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const OPTIONS = optionsHandler;
export const GET = (request) => handleGetReports(request);
export const POST = (request) => handleCreateReport(request);
