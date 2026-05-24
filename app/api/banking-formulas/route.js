import {
  handleGetBankingFormulas,
  handleCreateBankingFormula,
} from '@/lib/api/handlers/banking-formulas';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const GET = (request) => handleGetBankingFormulas(request);
export const POST = (request) => handleCreateBankingFormula(request);
