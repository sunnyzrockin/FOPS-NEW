'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Loader2, Save, X, ChevronUp, ChevronDown, Settings, Trash2, Droplets, Copy, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

import { toast } from 'sonner';
import { authedFetch } from '@/lib/authed-fetch';
import { useConfirmDialog } from '@/hooks/use-confirm-dialog';
/**
 * FieldConfiguration — Operator-facing UI to customize the shift report
 * form fields per site. Now split across two tabs:
 *
 *   • Sales & Payments  — category = 'sales' (default, the original list)
 *   • Fuel Tank Dips    — category = 'dip'   (custom fuel grades like E10,
 *                                              U95, U98, LPG, AdBlue, ...)
 *
 * Custom dip fields appear ADDITIVELY on the staff shift report below the
 * built-in ULP / Diesel / Premium grades. Each gets a tank-level and an
 * optional delivery input. Values land in dip_readings.custom_values (JSON).
 */
export default function FieldConfiguration({ user, sites }) {
  const { confirm: confirmDialog, ConfirmDialog } = useConfirmDialog();
  const [selectedSite, setSelectedSite] = useState(sites[0]?.id || '');
  const [category, setCategory] = useState('sales'); // 'sales' | 'dip'
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddField, setShowAddField] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newField, setNewField] = useState({
    label: '',
    field_type: 'number',
    visibility: 'all',
    is_mandatory: false,
  });

  // "Copy fields from another site" wizard state
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySourceSiteId, setCopySourceSiteId] = useState('');
  const [copySourceFields, setCopySourceFields] = useState([]);
  const [copyLoadingSource, setCopyLoadingSource] = useState(false);
  const [copySelectedKeys, setCopySelectedKeys] = useState(new Set());
  const [copyConflictMode, setCopyConflictMode] = useState('skip'); // 'skip' | 'overwrite'
  const [copyApplying, setCopyApplying] = useState(false);

  const loadFields = useCallback(async () => {
    if (!selectedSite) {
      // No site selected — don't show spinner forever.
      setFields([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await authedFetch(
        `/api/field-configs?siteId=${selectedSite}&category=${category}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setFields(list.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)));
    } catch (err) {
      console.error('Failed to load fields:', err);
      setFields([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, category]);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authedFetch('/api/field-configs/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: fields }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(`Failed to save: ${data.error || data.message || res.status}`);
      } else {
        loadFields();
      }
    } catch (err) {
      toast.error('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddField = async () => {
    if (!newField.label) { toast.error('Label is required'); return; }
    if (!selectedSite) { toast.info('Please select a site first'); return; }
    setAdding(true);
    try {
      const fieldKey = newField.label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .substring(0, 60) || `field_${Date.now()}`;

      const res = await authedFetch('/api/field-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_id: selectedSite,
          key: fieldKey,
          label: newField.label,
          // Dip fields are always numeric (litres).
          field_type: category === 'dip' ? 'number' : newField.field_type,
          // Dip fields are shown to everyone (staff must enter; owner sees).
          visibility: category === 'dip' ? 'all' : (newField.visibility || 'all'),
          is_mandatory: !!newField.is_mandatory,
          display_order: fields.length + 1,
          is_core: false,
          is_enabled: true,
          // Dip fields don't belong in the Banking Formula Builder palette
          // — they're inventory, not financial. Default OFF.
          show_in_banking: category !== 'dip',
          category, // 'sales' or 'dip'
          created_by_user_id: user.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data.message || data.error || res.status;
        const hint = data.hint ? `\nHint: ${data.hint}` : '';
        toast.error(`Failed to add field: ${detail}${hint}`);
        return;
      }
      setNewField({ label: '', field_type: 'number', visibility: 'all', is_mandatory: false });
      setShowAddField(false);
      loadFields();
    } catch (err) {
      toast.error('Failed to add field: ' + err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (fieldId) => {
    // Look up the field to vary the confirmation depending on core-status.
    const field = fields.find((f) => f.id === fieldId);
    const isCore = !!field?.is_core;
    const label = field?.label || 'this field';

    const confirmMsg = isCore
      ? `"${label}" is a CORE field.\n\n` +
        `Deleting it will remove the column from the staff shift report form, and any banking ` +
        `formulas, KPI cards, or dashboards that reference it will skip this value.\n\n` +
        `This is reversible — you can re-add the field later via "Add Field".\n\n` +
        `Continue and delete "${label}"?`
      : `Delete "${label}"? You can re-add it later via "Add Field".`;

    if (!(await confirmDialog('Delete field?', confirmMsg, { destructive: true, confirmLabel: 'Delete' }))) return;

    try {
      const res = await authedFetch(`/api/field-configs/${fieldId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // 409 means the field is referenced by an active banking formula —
        // show the full helpful message that lists which formulas use it.
        const msg = data.message || data.error || `HTTP ${res.status}`;
        toast.info(msg);
        return;
      }
      loadFields();
    } catch (err) {
      toast.error('Failed to delete: ' + err.message);
    }
  };

  const updateField = (id, key, value) => {
    setFields(fields.map((f) => (f.id === id ? { ...f, [key]: value } : f)));
  };

  const moveField = (index, direction) => {
    const newFields = [...fields];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newFields.length) return;
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    newFields.forEach((f, i) => { f.display_order = i + 1; });
    setFields(newFields);
  };

  // ---------- Copy from another site ----------

  const otherSites = sites.filter((s) => s.id !== selectedSite);

  const openCopyDialog = () => {
    setCopySourceSiteId('');
    setCopySourceFields([]);
    setCopySelectedKeys(new Set());
    setCopyConflictMode('skip');
    setCopyOpen(true);
  };

  const loadCopySourceFields = async (siteId) => {
    setCopySourceSiteId(siteId);
    setCopySourceFields([]);
    setCopySelectedKeys(new Set());
    if (!siteId) return;
    setCopyLoadingSource(true);
    try {
      const res = await authedFetch(`/api/field-configs?siteId=${siteId}&category=${category}`);
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setCopySourceFields(list);
      // Default: pre-select all source fields
      setCopySelectedKeys(new Set(list.map((f) => f.key)));
    } catch (err) {
      console.error('Failed to load source site fields', err);
      setCopySourceFields([]);
    } finally {
      setCopyLoadingSource(false);
    }
  };

  const toggleCopyKey = (key) => {
    setCopySelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const applyCopy = async () => {
    if (!copySourceSiteId || copySelectedKeys.size === 0) {
      setCopyOpen(false);
      return;
    }
    setCopyApplying(true);
    const existingKeys = new Set(fields.map((f) => f.key));
    const toCopy = copySourceFields.filter((f) => copySelectedKeys.has(f.key));

    let inserted = 0, updated = 0, skipped = 0, failed = 0;
    let nextOrder = fields.length + 1;

    for (const src of toCopy) {
      const existing = fields.find((f) => f.key === src.key);
      if (existing && copyConflictMode === 'skip') {
        skipped++; continue;
      }
      try {
        if (existing && copyConflictMode === 'overwrite') {
          const res = await authedFetch(`/api/field-configs/${existing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label: src.label,
              field_type: src.field_type,
              visibility: src.visibility,
              is_mandatory: src.is_mandatory,
              show_in_banking: src.show_in_banking,
              is_enabled: src.is_enabled,
            }),
          });
          if (res.ok) updated++; else failed++;
        } else {
          const res = await authedFetch('/api/field-configs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              site_id: selectedSite,
              key: src.key,
              label: src.label,
              field_type: src.field_type,
              visibility: src.visibility,
              is_mandatory: !!src.is_mandatory,
              display_order: nextOrder++,
              is_core: false,
              is_enabled: src.is_enabled !== false,
              show_in_banking: !!src.show_in_banking,
              category,
              created_by_user_id: user.id,
            }),
          });
          if (res.ok) inserted++; else failed++;
        }
      } catch {
        failed++;
      }
    }
    setCopyApplying(false);
    setCopyOpen(false);
    await loadFields();
    const parts = [];
    if (inserted) parts.push(`${inserted} added`);
    if (updated) parts.push(`${updated} updated`);
    if (skipped) parts.push(`${skipped} skipped (already exist)`);
    if (failed) parts.push(`${failed} FAILED`);
    toast.info(`Copy complete: ${parts.join(', ') || 'no changes'}.`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Form Field Configuration</h2>
          <p className="text-muted-foreground">Customize fields for staff shift report form</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedSite} onValueChange={setSelectedSite}>
            <SelectTrigger className="w-[250px]"><SelectValue placeholder="Select site" /></SelectTrigger>
            <SelectContent>
              {sites.map((site) => <SelectItem key={site.id} value={site.id}>{site.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowAddField(true)} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            {category === 'dip' ? 'Add Tank Field' : 'Add Field'}
          </Button>
          <Button onClick={openCopyDialog} variant="outline" disabled={otherSites.length === 0} title={otherSites.length === 0 ? 'No other sites to copy from' : 'Copy fields from another site'}>
            <Copy className="h-4 w-4 mr-2" /> Copy from site
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-blue-500 to-indigo-600">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save Changes
          </Button>
        </div>
      </div>

      <Tabs value={category} onValueChange={(v) => { setCategory(v); setShowAddField(false); }}>
        <TabsList>
          <TabsTrigger value="sales" className="gap-2">
            <Settings className="h-4 w-4" /> Sales &amp; Payments
          </TabsTrigger>
          <TabsTrigger value="dip" className="gap-2">
            <Droplets className="h-4 w-4" /> Fuel Tank Dips
          </TabsTrigger>
        </TabsList>

        {category === 'dip' && (
          <div className="mt-3 p-3 rounded-lg bg-sky-50 border border-sky-200 text-sm text-sky-800">
            Add extra fuel grades stocked at this site (e.g. <strong>E10</strong>,{' '}
            <strong>U95</strong>, <strong>U98</strong>, <strong>LPG</strong>,{' '}
            <strong>AdBlue</strong>). They appear on the staff shift report{' '}
            <em>below</em> the built-in ULP / Diesel / Premium grades, with a tank
            level + optional delivery input each.
          </div>
        )}
      </Tabs>

      {showAddField && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-4">
                <Label>Field Label</Label>
                <Input
                  value={newField.label}
                  onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                  placeholder="e.g., Lottery Sales"
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Type</Label>
                <Select value={newField.field_type} onValueChange={(v) => setNewField({ ...newField, field_type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="text">Text</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-3">
                <Label>Visibility</Label>
                <Select value={newField.visibility} onValueChange={(v) => setNewField({ ...newField, visibility: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Everyone</SelectItem>
                    <SelectItem value="staff_only">Staff only</SelectItem>
                    <SelectItem value="owner_only">Owner / Operator only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex items-center gap-2 pt-6">
                <Switch
                  checked={!!newField.is_mandatory}
                  onCheckedChange={(v) => setNewField({ ...newField, is_mandatory: v })}
                />
                <Label className="text-sm cursor-pointer">Required</Label>
              </div>
              <div className="sm:col-span-1 flex gap-1 justify-end">
                <Button onClick={handleAddField} disabled={adding} size="sm">
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setShowAddField(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedSite ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="font-medium">Select a site to configure fields</p>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a site from the dropdown above to view and edit its custom shift-report fields.
            </p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((field, index) => (
            <Card
              key={field.id}
              className={`${field.is_core ? 'border-blue-200 bg-blue-50/50' : ''} ${!field.is_enabled ? 'opacity-50' : ''}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => moveField(index, -1)}
                      disabled={index === 0}
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => moveField(index, 1)}
                      disabled={index === fields.length - 1}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <Input
                      value={field.label}
                      onChange={(e) => updateField(field.id, 'label', e.target.value)}
                      className="font-medium"
                      title={field.is_core ? 'You can rename a core field; the internal key stays the same.' : undefined}
                    />
                  </div>
                  <Badge variant="outline">{field.field_type}</Badge>
                  {field.is_core && <Badge className="bg-blue-100 text-blue-700">Core Field</Badge>}

                  {/* Visibility inline selector */}
                  <Select
                    value={field.visibility || 'all'}
                    onValueChange={(v) => updateField(field.id, 'visibility', v)}
                  >
                    <SelectTrigger className="w-[170px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Everyone</SelectItem>
                      <SelectItem value="staff_only">Staff only</SelectItem>
                      <SelectItem value="owner_only">Owner / Operator only</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Required toggle */}
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Required</Label>
                    <Switch
                      checked={!!field.is_mandatory}
                      onCheckedChange={(v) => updateField(field.id, 'is_mandatory', v)}
                    />
                  </div>

                  {/* Enabled toggle */}
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">Enabled</Label>
                    <Switch
                      checked={field.is_enabled}
                      onCheckedChange={(v) => updateField(field.id, 'is_enabled', v)}
                    />
                  </div>

                  {/* Show in Banking toggle — controls whether this field
                      appears in the Banking Formula Builder's Available
                      Fields palette. Defaults OFF for core fields, ON for
                      custom ones (operator decides). */}
                  <div className="flex items-center gap-2">
                    <Label className="text-sm" title="If on, this field appears in the Banking Formula Builder's Available Fields palette.">
                      Show in Banking
                    </Label>
                    <Switch
                      checked={field.show_in_banking !== false}
                      onCheckedChange={(v) => updateField(field.id, 'show_in_banking', v)}
                    />
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(field.id)}
                    title={field.is_core
                      ? 'Delete this core field (you can re-add it later)'
                      : 'Delete this field'}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Copy fields from another site dialog */}
      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-blue-600" />
              Copy fields from another site
            </DialogTitle>
            <DialogDescription>
              Pick a source site, then choose which {category === 'dip' ? 'tank dip' : 'sales & payment'} fields to copy
              into <strong>{sites.find((s) => s.id === selectedSite)?.name || 'this site'}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Source site picker */}
            <div className="space-y-1.5">
              <Label className="text-sm">Source site</Label>
              <Select value={copySourceSiteId} onValueChange={loadCopySourceFields}>
                <SelectTrigger><SelectValue placeholder="Choose a site to copy from" /></SelectTrigger>
                <SelectContent>
                  {otherSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Conflict mode */}
            {copySourceSiteId && (
              <div className="space-y-1.5">
                <Label className="text-sm">If a field with the same key already exists on this site</Label>
                <Select value={copyConflictMode} onValueChange={setCopyConflictMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">Skip — keep my existing field</SelectItem>
                    <SelectItem value="overwrite">Overwrite — replace my field with the source version</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Source fields list */}
            {copySourceSiteId && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm">
                    {copyLoadingSource ? 'Loading…' : `${copySourceFields.length} field${copySourceFields.length === 1 ? '' : 's'} available · ${copySelectedKeys.size} selected`}
                  </Label>
                  {copySourceFields.length > 0 && (
                    <div className="flex gap-2 text-xs">
                      <button type="button" className="text-blue-600 hover:underline"
                        onClick={() => setCopySelectedKeys(new Set(copySourceFields.map((f) => f.key)))}>Select all</button>
                      <button type="button" className="text-slate-500 hover:underline"
                        onClick={() => setCopySelectedKeys(new Set())}>Clear</button>
                    </div>
                  )}
                </div>
                {copyLoadingSource ? (
                  <div className="py-6 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  </div>
                ) : copySourceFields.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    This site has no {category === 'dip' ? 'tank dip' : 'sales'} fields configured.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
                    {copySourceFields.map((f) => {
                      const conflict = fields.some((ff) => ff.key === f.key);
                      const checked = copySelectedKeys.has(f.key);
                      return (
                        <label key={f.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 ${checked ? 'bg-blue-50' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCopyKey(f.key)}
                            className="w-4 h-4"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{f.label}</div>
                            <div className="text-[11px] text-muted-foreground font-mono">{f.key}</div>
                          </div>
                          <Badge variant="outline" className="text-[10px]">{f.field_type || 'number'}</Badge>
                          {f.is_mandatory && <Badge className="text-[10px] bg-amber-100 text-amber-700">required</Badge>}
                          {conflict && (
                            <span className="flex items-center gap-1 text-[11px] text-amber-700" title="A field with this key already exists on the target site.">
                              <AlertTriangle className="h-3 w-3" /> exists
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCopyOpen(false)}>Cancel</Button>
            <Button
              onClick={applyCopy}
              disabled={!copySourceSiteId || copySelectedKeys.size === 0 || copyApplying}
              className="bg-gradient-to-r from-blue-600 to-indigo-600"
            >
              {copyApplying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              Copy {copySelectedKeys.size > 0 ? `${copySelectedKeys.size} field${copySelectedKeys.size === 1 ? '' : 's'}` : 'fields'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    
    <ConfirmDialog />
  </div>
  );
}
