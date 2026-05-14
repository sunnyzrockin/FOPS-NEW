'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Calculator, Loader2, Pencil, Trash2 } from 'lucide-react';
import BankingFormulaBuilder from '@/components/operator/banking/banking-formula-builder';

/**
 * BankingManagement — Operator-facing wrapper around BankingFormulaBuilder.
 * Lists existing banking formulas per site and lets the operator create/
 * edit/delete them. Extracted from /app/app/app/page.js as Phase C of the
 * dashboard monolith refactor.
 */
export default function BankingManagement({ user, sites }) {
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || '');
  const [formulas, setFormulas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingFormula, setEditingFormula] = useState(null);

  const loadFormulas = useCallback(async () => {
    if (!selectedSite) {
      // No site selected — don't show spinner forever.
      setFormulas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/banking-formulas?siteId=${selectedSite}`, { cache: 'no-store' });
      const data = await res.json();
      setFormulas(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load formulas:', err);
      setFormulas([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    loadFormulas();
  }, [loadFormulas]);

  const handleDelete = async (formulaId) => {
    if (!confirm('Delete this formula?')) return;
    try {
      const res = await fetch(`/api/banking-formulas/${formulaId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Failed to delete formula: ${data.error || data.message || res.status}`);
        return;
      }
      loadFormulas();
    } catch (err) {
      alert('Failed to delete formula: ' + err.message);
    }
  };

  const handleBuilderClose = (saved) => {
    setShowBuilder(false);
    setEditingFormula(null);
    if (saved) loadFormulas();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Banking Calculator</h2>
          <p className="text-muted-foreground">Create formulas to calculate banking totals</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedSite} onValueChange={setSelectedSite}>
            <SelectTrigger className="w-[250px]"><SelectValue placeholder="Select site" /></SelectTrigger>
            <SelectContent>
              {sites.map((site) => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowBuilder(true)} className="bg-gradient-to-r from-purple-500 to-pink-500">
            <Plus className="h-4 w-4 mr-2" /> New Formula
          </Button>
        </div>
      </div>

      {showBuilder && (
        <Card className="border-0 shadow-xl">
          <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50">
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" /> {editingFormula ? 'Edit Formula' : 'Create Banking Formula'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <BankingFormulaBuilder siteId={selectedSite} userId={user.id} onClose={handleBuilderClose} existingFormula={editingFormula} />
          </CardContent>
        </Card>
      )}

      {!showBuilder && (
        <div className="space-y-4">
          {!selectedSite ? (
            <Card className="border-dashed border-2">
              <CardContent className="py-12 text-center">
                <Calculator className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p className="font-medium">Select a site to view its banking formulas</p>
                <p className="text-sm text-muted-foreground mt-1">Choose a site from the dropdown above.</p>
              </CardContent>
            </Card>
          ) : loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            </div>
          ) : formulas.length === 0 ? (
            <Card className="border-dashed border-2">
              <CardContent className="py-12 text-center">
                <Calculator className="h-12 w-12 mx-auto mb-4 text-slate-300" />
                <p className="text-muted-foreground">No banking formulas yet. Create one to get started.</p>
              </CardContent>
            </Card>
          ) : (
            formulas.map((formula) => {
              let operations = [];
              try { operations = JSON.parse(formula.formula_json).operations || []; } catch {}

              return (
                <Card key={formula.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                  <CardContent className="p-0">
                    <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{formula.name}</h3>
                        <p className="text-sm text-muted-foreground">Result: {formula.result_label}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={formula.is_active ? 'default' : 'secondary'} className={formula.is_active ? 'bg-green-100 text-green-700' : ''}>
                          {formula.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        <Button variant="ghost" size="icon" onClick={() => { setEditingFormula(formula); setShowBuilder(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(formula.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex flex-wrap gap-2 items-center">
                        {operations.map((op, idx) => (
                          <span
                            key={idx}
                            className={`px-3 py-1 rounded-lg text-sm font-medium ${
                              op.type === 'operator'
                                ? 'bg-slate-100'
                                : op.type === 'field'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {op.type === 'operator'
                              ? (op.value === '*' ? '×' : op.value === '/' ? '÷' : op.value)
                              : (op.label || op.value)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
