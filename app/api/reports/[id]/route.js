import {
  handleGetReportById, handleDeleteReport,
} from '@/lib/api/handlers/reports';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const GET = async (request, { params }) => {
  const { id } = await params;
  return handleGetReportById(id, request);
};
export const DELETE = async (request, { params }) => {
  const { id } = await params;
  return handleDeleteReport(id, request);
};
