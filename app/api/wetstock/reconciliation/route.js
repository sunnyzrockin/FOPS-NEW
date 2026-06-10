import { handleWetstockReconciliation } from '@/lib/api/handlers/wetstock';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  return handleWetstockReconciliation(request);
}
