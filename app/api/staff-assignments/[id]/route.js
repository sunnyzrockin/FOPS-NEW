import { handleDeleteStaffAssignment } from '@/lib/api/handlers/assignments';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const DELETE = async (request, { params }) => {
  const { id } = await params;
  return handleDeleteStaffAssignment(request, id);
};
