import {
  handleUpdateFieldConfig,
  handleDeleteFieldConfig,
} from '@/lib/api/handlers/field-configs';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const PUT = async (request, { params }) => {
  const { id } = await params;
  return handleUpdateFieldConfig(request, id);
};
export const DELETE = async (request, { params }) => {
  const { id } = await params;
  return handleDeleteFieldConfig(request, id);
};
