'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Sparkles } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { authedFetch } from '@/lib/authed-fetch';

/**
 * BankingFormulaBuilder — premium calculator-style formula builder. Lets an
 * operator compose a banking formula by clicking fields + operators, with
 * live preview against sample data. Saves via /api/banking-formulas.
 *
 * Phase 3 fixes (May 2026):
 *  - Available Fields are pulled LIVE from /api/field-configs?siteId=... so
 *    any custom form fields the operator added on the "Form Fields" tab
 *    show up immediately. Falls back to a hardcoded core list if the API
 *    is unreachable so the palette is never empty.
 *  - Clear All now also resets the formula name + result label so the
 *    button gives obvious feedback even when the canvas was already empty.
 *  - Operator buttons (+ − × ÷) are no longer silently swallowed: clicking
 *    "+" on an empty canvas auto-prepends a "0", and clicking a second
 *    operator in a row replaces the previous one.
 */
export default function BankingFormulaBuilder({ siteId, userId, onClose, existingFormula }) {
  const [name, setName] = useState(existingFormula?.name || 'Banking Calculation');
  const [resultLabel, setResultLabel] = useState(existingFormula?.result_label || 'Banking Total');
  const [operations, setOperations] = useState(() => {
    if (existingFormula?.formula_json) {
      try {
        return JSON.parse(existingFormula.formula_json).operations || [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(0);
  const [customFields, setCustomFields] = useState(null); // null=loading, []=empty, [...]=loaded
  const [fieldsError, setFieldsError] = useState(null);

  // Canonical core fields — also seeds sample data for the live preview.
  const CORE_FIELDS = useMemo(() => ([
    { key: 'fuel_sales', label: 'Fuel Sales', sample: 3500 },
    { key: 'shop_sales', label: 'Shop Sales', sample: 850 },
    { key: 'eftpos', label: 'EFTPOS', sample: 2800 },
    { key: 'motorpass', label: 'Motorpass', sample: 500 },
    { key: 'cash', label: 'Cash', sample: 350 },
    { key: 'accounts', label: 'Accounts', sample: 500 },
    { key: 'beverages', label: 'Beverages', sample: 300 },
    { key: 'hot_food', label: 'Hot Food', sample: 200 },
    { key: 'drive_offs', label: 'Drive Offs', sample: 0 },
    { key: 'dips', label: 'Dips', sample: 15000 },
    { key: 'total_litres', label: 'Total Litres', sample: 2000 },
  ]), []);

  // Fetch the live field configs whenever siteId changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!siteId) { setCustomFields([]); return; }
      setCustomFields(null);
      setFieldsError(null);
      try {
        const res = await authedFetch(`/api/field-configs?siteId=${siteId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const usable = (Array.isArray(data) ? data : [])
          .filter((f) => f.is_enabled !== false)
          .filter((f) => !f.field_type || ['number', 'currency', 'decimal', 'integer'].includes(f.field_type))
          .map((f) => ({ key: f.key, label: f.label || f.key, is_core: !!f.is_core }));
        setCustomFields(usable);
      } catch (e) {
        if (!cancelled) {
          console.warn('field-configs load failed, falling back to core list:', e);
          setFieldsError(e.message);
          setCustomFields([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  // Merge live API list with CORE_FIELDS so the palette is always populated,
  // and so we always have a sample value for the live preview.
  const availableFields = useMemo(() => {
    const live = customFields || [];
    if (live.length === 0) return CORE_FIELDS;
    const seen = new Set();
    const merged = [];
    for (const f of live) {
      if (!seen.has(f.key)) {
        seen.add(f.key);
        const sampleFromCore = CORE_FIELDS.find((c) => c.key === f.key)?.sample;
        merged.push({ ...f, sample: sampleFromCore ?? 1000 });
      }
    }
    for (const c of CORE_FIELDS) {
      if (!seen.has(c.key)) { seen.add(c.key); merged.push(c); }
    }
    return merged;
  }, [customFields, CORE_FIELDS]);

  const operators = [
    { value: '+', label: '+', color: 'bg-green-100 text-green-700 hover:bg-green-200' },
    { value: '-', label: '−', color: 'bg-red-100 text-red-700 hover:bg-red-200' },
    { value: '*', label: '×', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
    { value: '/', label: '÷', color: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
  ];

  const addField = (field) => {
    setOperations((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].type !== 'operator') {
        return [...prev, { type: 'operator', value: '+' }, { type: 'field', value: field.key, label: field.label }];
      }
      return [...prev, { type: 'field', value: field.key, label: field.label }];
    });
  };

  const addOperator = (op) => {
    setOperations((prev) => {
      if (prev.length === 0) {
        return [{ type: 'number', value: 0 }, { type: 'operator', value: op }];
      }
      const last = prev[prev.length - 1];
      if (last.type === 'operator') {
        const copy = prev.slice(0, -1);
        copy.push({ type: 'operator', value: op });
        return copy;
      }
      return [...prev, { type: 'operator', value: op }];
    });
  };

  const addNumber = () => {
    const num = prompt('Enter a number:');
    if (num == null || isNaN(parseFloat(num))) return;
    setOperations((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].type !== 'operator') {
        return [...prev, { type: 'operator', value: '+' }, { type: 'number', value: parseFloat(num) }];
      }
      return [...prev, { type: 'number', value: parseFloat(num) }];
    });
  };

  const removeOperation = (index) => {
    setOperations((prev) => {
      const newOps = [...prev];
      newOps.splice(index, 1);
      if (newOps.length > 0 && newOps[0].type === 'operator') newOps.shift();
      if (newOps.length > 0 && newOps[newOps.length - 1].type === 'operator') newOps.pop();
      return newOps;
    });
  };

  const clearAll = () => {
    setOperations([]);
    setName('Banking Calculation');
    setResultLabel('Banking Total');
  };

  // Live test calculation with sample data.
  useEffect(() => {
    const sampleData = Object.fromEntries(
      availableFields.map((f) => [f.key, f.sample ?? 0])
    );
    let result = 0;
    let currentOp = '+';
    for (const op of operations) {
      if (op.type === 'operator') {
        currentOp = op.value;
      } else {
        const value = op.type === 'field' ? (sampleData[op.value] || 0) : (parseFloat(op.value) || 0);
        switch (currentOp) {
          case '+': result += value; break;
          case '-': result -= value; break;
          case '*': result *= value; break;
          case '/': result = value !== 0 ? result / value : result; break;
          default: break;
        }
      }
    }
    setTestResult(Math.round(result * 100) / 100);
  }, [operations, availableFields]);

  const handleSave = async () => {
    if (operations.length === 0) {
      alert('Please add at least one field to the formula');
      return;
    }
    setSaving(true);
    try {
      const url = existingFormula ? `/api/banking-formulas/${existingFormula.id}` : '/api/banking-formulas';
      const method = existingFormula ? 'PUT' : 'POST';
      const res = await authedFetch(url, {
        method,
        body: JSON.stringify({
          site_id: siteId,
          name,
          formula_json: JSON.stringify({ operations }),
          result_label: resultLabel,
          created_by_user_id: userId,
        }),
      });
      if (res.ok) {
        onClose(true);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || err.message || `Failed to save formula (HTTP ${res.status})`);
      }
    } catch (err) {
      alert('Error saving formula: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Formula Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Daily Banking" className="mt-1" />
        </div>
        <div>
          <Label>Result Label</Label>
          <Input value={resultLabel} onChange={(e) => setResultLabel(e.target.value)} placeholder="e.g., Banking Total" className="mt-1" />
        </div>
      </div>

      {/* Formula Display */}
      <div className="min-h-[80px] p-4 bg-gradient-to-r from-slate-100 to-slate-50 rounded-2xl border-2 border-dashed border-slate-300">
        {operations.length === 0 ? (
          <p className="text-slate-400 text-center py-4">Click fields below to build your formula</p>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            {operations.map((op, idx) => (
              <div key={idx} className="group relative">
                {op.type === 'operator' ? (
                  <span className="inline-flex items-center justify-center w-10 h-10 text-lg font-bold bg-white rounded-xl shadow-sm border">
                    {op.value === '*' ? '×' : op.value === '/' ? '÷' : op.value}
                  </span>
                ) : op.type === 'field' ? (
                  <span className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-700 rounded-xl font-medium shadow-sm">
                    {op.label || op.value}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-4 py-2 bg-amber-100 text-amber-700 rounded-xl font-medium shadow-sm">
                    {op.value}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeOperation(idx)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs"
                  title="Remove this token"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Result */}
      <div className="p-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white">
        <p className="text-sm opacity-90">Live Preview (with sample data)</p>
        <p className="text-3xl font-bold">{formatCurrency(testResult)}</p>
      </div>

      {/* Operators */}
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Operators</Label>
        <div className="flex gap-2 items-center">
          {operators.map((op) => (
            <button
              key={op.value}
              type="button"
              onClick={() => addOperator(op.value)}
              className={`w-12 h-12 rounded-xl font-bold text-xl transition-all ${op.color} shadow-sm hover:shadow-md`}
              title={`Add ${op.label}`}
            >
              {op.label}
            </button>
          ))}
          <button
            type="button"
            onClick={addNumber}
            className="px-4 h-12 rounded-xl font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all shadow-sm"
            title="Add a constant number"
          >
            123
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="px-4 h-12 rounded-xl font-medium bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 transition-all shadow-sm ml-auto"
            title="Clear formula and reset labels"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Available Fields */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <Label className="text-xs text-muted-foreground">Available Fields</Label>
          {customFields === null ? (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading fields…
            </span>
          ) : fieldsError ? (
            <span className="text-xs text-amber-700">Using fallback list (API: {fieldsError})</span>
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> {availableFields.length} field(s) — synced from Form Fields tab
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {availableFields.map((field) => (
            <button
              key={field.key}
              type="button"
              onClick={() => addField(field)}
              className="px-3 py-2.5 rounded-xl text-sm font-medium bg-slate-100 hover:bg-blue-100 hover:text-blue-700 transition-all text-left"
              title={`Add ${field.label} (${field.key})`}
            >
              {field.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button variant="outline" onClick={() => onClose(false)} className="flex-1">
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save Formula
        </Button>
      </div>
    </div>
  );
}
