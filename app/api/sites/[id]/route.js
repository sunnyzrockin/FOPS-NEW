import { handleGetSiteById, handleUpdateSite, handleDeleteSite } from '@/lib/api/handlers/sites';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const GET = async (request, { params }) => {
  const { id } = await params;
  return handleGetSiteById(request, id);
};
export const PUT = async (request, { params }) => {
  const { id } = await params;
  return handleUpdateSite(request, id);
};
export const DELETE = async (request, { params }) => {
  const { id } = await params;
  return handleDeleteSite(request, id);
};
