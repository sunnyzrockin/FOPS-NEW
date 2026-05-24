import {
  handleUpdateBankingFormula,
  handleDeleteBankingFormula,
} from '@/lib/api/handlers/banking-formulas';
import { optionsHandler } from '@/lib/api/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const OPTIONS = optionsHandler;
export const PUT = async (request, { params }) => {
  const { id } = await params;
  return handleUpdateBankingFormula(request, id);
};
export const DELETE = async (request, { params }) => {
  const { id } = await params;
  return handleDeleteBankingFormula(request, id);
};
