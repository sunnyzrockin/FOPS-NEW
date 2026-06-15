import { handleGetSiteById, handleUpdateSite, handleDeleteSite, handlePatchSite } from '@/lib/api/handlers/sites';
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
// PATCH = operator-allowed, field-whitelisted updates (shifts_per_day, etc.)
export const PATCH = async (request, { params }) => {
  const { id } = await params;
  return handlePatchSite(request, id);
};
export const DELETE = async (request, { params }) => {
  const { id } = await params;
  return handleDeleteSite(request, id);
};
