import { handleUpdateTank, handleDeleteTank } from '@/lib/api/handlers/tanks';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const PUT = async (request, { params }) => {
  const { id } = await params;
  return handleUpdateTank(request, id);
};
export const DELETE = async (request, { params }) => {
  const { id } = await params;
  return handleDeleteTank(request, id);
};
