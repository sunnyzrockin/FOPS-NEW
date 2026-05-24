import {
  handleUpdateSiteCompetitor, handleDeleteSiteCompetitor,
} from '@/lib/api/handlers/fuel-prices';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const PUT = async (request, { params }) => {
  const { id } = await params;
  return handleUpdateSiteCompetitor(id, request);
};
export const DELETE = async (request, { params }) => {
  const { id } = await params;
  return handleDeleteSiteCompetitor(id, request);
};
