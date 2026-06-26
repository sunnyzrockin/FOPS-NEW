import { handlePostLiveSync } from '@/lib/api/handlers/fuel-prices-live';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// B4 (EMERGENT_auth_hardening.md): this endpoint is auth-gated to
// `requireRole(['owner'])` inside handlePostLiveSync. The handler also
// hits a paid third-party (QFMP) on each call, so even the owner-only
// gate is the right cost-control posture. Do NOT relax to operator/anon.

export const OPTIONS = optionsHandler;
export async function POST(request) { return handlePostLiveSync(request); }
