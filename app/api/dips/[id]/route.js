import { handleUpdateDip, handleDeleteDip } from '@/lib/api/handlers/dips';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const OPTIONS = optionsHandler;
export async function PUT(request, { params })    { return handleUpdateDip(params.id, request); }
export async function DELETE(request, { params }) { return handleDeleteDip(params.id, request); }
