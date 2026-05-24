import {
  handleGetOperatorAssignments,
  handleCreateOperatorAssignment,
} from '@/lib/api/handlers/assignments';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const GET = (request) => handleGetOperatorAssignments(request);
export const POST = (request) => handleCreateOperatorAssignment(request);
