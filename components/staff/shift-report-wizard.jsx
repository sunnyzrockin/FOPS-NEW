'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  ClipboardList, CheckCircle2, Loader2, ArrowLeft, ArrowRight, Calculator,
  Droplets, Building2, Calendar, ShoppingBag, FileText, Truck,
} from 'lucide-react';
import { authedFetch } from '@/lib/authed-fetch';
import { evalFormula, looksLikeFormula } from '@/lib/eval-formula';
import { useShiftDraft } from '@/hooks/use-shift-draft';

import { toast } from 'sonner';
const STEPS = [
  { id: 'basics', label: 'Shift', icon: Calendar },
  { id: 'sales', label: 'Sales', icon: ShoppingBag },
  { id: 'dips', label: 'Fuel Dips', icon: Droplets },
  { id: 'review', label: 'Review', icon: FileText },
];

/**
 * ShiftReportWizard — Mobile-first, single-section-per-screen variant of
 * the shift report. Same data model as the classic form, just paginated.
 * Designed so an attendant on a phone can fill out a shift without ever
 * scrolling sideways.
 */
export default function ShiftReportWizard({ user, sites, onSuccess, onSwitchToClassic, modeToggle }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errors, setErrors] = useState({});

  const [salesFields, setSalesFields] = useState([]);
  const [dipFields, setDipFields] = useState([]);

  const [form, setForm] = useState({
    site_id: sites[0]?.id || '',
    date: new Date().toISOString().split('T')[0],
    shift_type: 'Morning',
  });

  // Draft autosave — keyed by (site, date). Restoring keeps wizard step at
  // the current position; we don't try to also persist `step` because the
  // user is most likely to want to start at Step 1 (Basics) anyway.
  const { availableDraft, restoreDraft, dismissDraft, clearDraft } = useShiftDraft({
    siteId: form.site_id,
    date: form.date,
    form,
  });

  // Load field configs whenever site changes
  useEffect(() => {
    if (!form.site_id) return;
    (async () => {
      try {
        const res = await authedFetch(`/api/field-configs?siteId=${form.site_id}`);
        const data = await res.json();
        const all = (Array.isArray(data) ? data : [])
          .filter((f) => f.is_enabled)
          .filter((f) => {
            const v = f.visibility || 'all';
            return v === 'all' || v === 'staff_only';
          })
          .sort((a, b) => a.display_order - b.display_order);
        setSalesFields(all.filter((f) => (f.category || 'sales') === 'sales'));
        setDipFields(all.filter((f) => f.category === 'dip'));
      } catch (err) {
        console.error('Wizard field-config load failed', err);
      }
    })();
  }, [form.site_id]);

  const handle = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((p) => ({ ...p, [k]: null }));
  };

  const onNumericBlur = (k) => {
    const v = form[k];
    if (v == null || v === '') return;
    if (/^-?\d+(\.\d+)?$/.test(String(v).trim())) return;
    const e = evalFormula(v);
    if (e != null) setForm((p) => ({ ...p, [k]: String(e) }));
  };

  const validateStep = () => {
    const newErrors = {};
    if (step === 0) {
      if (!form.site_id) newErrors.site_id = 'Required';
      if (!form.date) newErrors.date = 'Required';
      if (!form.shift_type) newErrors.shift_type = 'Required';
    }
    if (step === 1) {
      for (const f of salesFields) {
        if (!f.is_core) continue;
        const v = form[f.key];
        if (v == null || String(v).trim() === '') {
          newErrors[f.key] = `${f.label} is required`;
          continue;
        }
        if (f.field_type === 'number') {
          const plain = /^-?\d+(\.\d+)?$/.test(String(v).trim());
          if (!plain && evalFormula(v) == null) newErrors[f.key] = 'Invalid number';
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const goNext = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    if (!validateStep()) return;
    setLoading(true);
    try {
      // Coerce numeric fields and pack custom dips identical to the classic form.
      const coerced = { ...form };
      const coerceOne = (k) => {
        const v = coerced[k];
        if (v == null || v === '') return;
        if (/^-?\d+(\.\d+)?$/.test(String(v).trim())) return;
        const e = evalFormula(v);
        if (e != null) coerced[k] = String(e);
      };
      for (const f of salesFields) coerceOne(f.key);
      for (const k of [
        'dip_ulp_litres', 'dip_diesel_litres', 'dip_premium_litres',
        'delivery_ulp_litres', 'delivery_diesel_litres', 'delivery_premium_litres',
      ]) coerceOne(k);

      const customDipValues = {};
      for (const f of dipFields) {
        const lvl = coerced[`custom_dip__${f.key}__level`];
        const del = coerced[`custom_dip__${f.key}__delivery`];
        const cleanLvl = lvl == null || lvl === '' ? null : Number(lvl);
        const cleanDel = del == null || del === '' ? 0 : Number(del);
        if (cleanLvl == null && cleanDel === 0) continue;
        customDipValues[f.key] = { level: cleanLvl, delivery: cleanDel };
      }
      coerced.custom_dip_values = customDipValues;

      const res = await authedFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify(coerced),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSuccess(true);
        clearDraft();
        onSuccess?.();
        setTimeout(() => {
          setSuccess(false);
          setStep(0);
          const reset = { site_id: form.site_id, date: form.date, shift_type: 'Morning' };
          setForm(reset);
        }, 2500);
      } else if (res.status === 409 || data.code === 'duplicate_report') {
        toast.info(`A ${form.shift_type} report for this date has already been submitted.`);
      } else if (res.status === 401) {
        toast.error('Your session has expired. Please refresh and log in again.');
      } else {
        toast.error(data.error || 'Submission failed');
      }
    } catch (e) {
      toast.error('Submission failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const progressPct = ((step + 1) / STEPS.length) * 100;
  const siteName = sites.find((s) => s.id === form.site_id)?.name || '—';

  if (success) {
    return (
      <Card className="border border-border/50 shadow-sm max-w-2xl mx-auto">
        <CardContent className="py-12 text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-emerald-700">Report Submitted!</h2>
          <p className="text-sm text-muted-foreground">Thank you — your shift report has been recorded.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {availableDraft && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start gap-3 text-sm">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-amber-900">
              Unsaved draft from {new Date(availableDraft.savedAt).toLocaleString()}
            </p>
            <p className="text-amber-800 text-xs mt-0.5">
              Restore it, or dismiss to start fresh.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              const restored = restoreDraft();
              if (restored) setForm(restored);
            }}
            className="h-8"
          >
            Restore
          </Button>
          <Button size="sm" variant="ghost" onClick={dismissDraft} className="h-8">
            Dismiss
          </Button>
        </div>
      )}

      {/* Progress strip */}
      <Card className="border border-border/50 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-teal-600" />
              <span className="font-semibold">Shift Report Wizard</span>
            </div>
            <button
              onClick={onSwitchToClassic}
              className="text-xs text-teal-600 hover:underline"
            >
              Switch to classic form
            </button>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-indigo-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const active = i === step;
              const done = i < step;
              return (
                <div key={s.id} className={`flex items-center gap-1 ${active ? 'text-teal-700 font-semibold' : done ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step content */}
      <Card className="border border-border/50 shadow-sm">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-lg">
                {(() => { const Icon = STEPS[step].icon; return <Icon className="h-5 w-5 text-teal-600" />; })()}
                Step {step + 1} of {STEPS.length}: {STEPS[step].label}
              </CardTitle>
              <CardDescription>
                {step === 0 && 'Tell us which site, date and shift this report is for.'}
                {step === 1 && 'Enter today\'s sales & payment totals. Formulas like +2450+1360 are supported.'}
                {step === 2 && 'Record current fuel tank levels and any deliveries received.'}
                {step === 3 && 'Review your entries below and tap Submit to send the report.'}
              </CardDescription>
            </div>
            {modeToggle}
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-5">
          {step === 0 && <StepBasics sites={sites} form={form} handle={handle} errors={errors} />}
          {step === 1 && <StepSales fields={salesFields} form={form} handle={handle} errors={errors} onBlur={onNumericBlur} />}
          {step === 2 && <StepDips dipFields={dipFields} form={form} handle={handle} onBlur={onNumericBlur} />}
          {step === 3 && <StepReview form={form} siteName={siteName} salesFields={salesFields} dipFields={dipFields} />}
        </CardContent>
      </Card>

      {/* Nav buttons */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={goBack} disabled={step === 0} className="gap-2 flex-1 sm:flex-none">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={goNext} className="gap-2 flex-1 sm:flex-none bg-gradient-to-r from-teal-600 to-indigo-600">
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={loading} className="gap-2 flex-1 sm:flex-none bg-gradient-to-r from-emerald-600 to-teal-600">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Submit Report
          </Button>
        )}
      </div>
    </div>
  );
}

// ============= Steps =============

function StepBasics({ sites, form, handle, errors }) {
  return (
    <div className="space-y-4">
      <FieldBlock label="Site" required error={errors.site_id} icon={Building2}>
        <Select value={form.site_id} onValueChange={(v) => handle('site_id', v)}>
          <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select site" /></SelectTrigger>
          <SelectContent>
            {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldBlock>
      <FieldBlock label="Date" required error={errors.date} icon={Calendar}>
        <Input type="date" value={form.date} onChange={(e) => handle('date', e.target.value)} className="h-12 text-base" />
      </FieldBlock>
      <FieldBlock label="Shift Type" required error={errors.shift_type}>
        <div className="grid grid-cols-3 gap-2">
          {['Morning', 'Afternoon', 'Night'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => handle('shift_type', s)}
              className={`h-12 rounded-lg border-2 text-sm font-medium transition-all ${
                form.shift_type === s
                  ? 'border-teal-500 bg-teal-50 text-teal-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </FieldBlock>
    </div>
  );
}

function StepSales({ fields, form, handle, errors, onBlur }) {
  if (!fields.length) {
    return <p className="text-sm text-muted-foreground text-center py-6">No sales fields configured for this site.</p>;
  }
  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
        <Calculator className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Tip: type formulas like <code className="font-mono bg-amber-100 px-1 rounded">+2450+1360</code> — the field will evaluate when you tab out.</span>
      </div>
      {fields.map((f) => {
        const raw = form[f.key] || '';
        const preview = looksLikeFormula(raw) ? evalFormula(raw) : null;
        return (
          <FieldBlock key={f.id} label={f.label} required={f.is_core} error={errors[f.key]}>
            <Input
              type="text"
              inputMode={f.field_type === 'number' ? 'decimal' : undefined}
              placeholder={f.field_type === 'number' ? '0.00 or +1+2' : ''}
              value={raw}
              onChange={(e) => handle(f.key, e.target.value)}
              onBlur={() => onBlur(f.key)}
              className={`h-12 text-base ${errors[f.key] ? 'border-red-500' : ''}`}
            />
            {preview != null && (
              <p className="text-xs text-teal-600 font-medium">
                = {preview.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            )}
          </FieldBlock>
        );
      })}
    </div>
  );
}

function StepDips({ dipFields, form, handle, onBlur }) {
  const builtIn = [
    { key: 'ulp', label: 'ULP 91 — Litres' },
    { key: 'diesel', label: 'Diesel — Litres' },
    { key: 'premium', label: 'Premium — Litres' },
  ];
  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Droplets className="h-4 w-4 text-teal-600" /> Tank Levels
        </h3>
        <div className="space-y-3">
          {builtIn.map((g) => (
            <div key={g.key} className="grid grid-cols-2 gap-2">
              <FieldBlock label={`${g.label} (level)`}>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={form[`dip_${g.key}_litres`] || ''}
                  onChange={(e) => handle(`dip_${g.key}_litres`, e.target.value)}
                  onBlur={() => onBlur(`dip_${g.key}_litres`)}
                  className="h-11"
                />
              </FieldBlock>
              <FieldBlock label="Delivery">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={form[`delivery_${g.key}_litres`] || ''}
                  onChange={(e) => handle(`delivery_${g.key}_litres`, e.target.value)}
                  onBlur={() => onBlur(`delivery_${g.key}_litres`)}
                  className="h-11"
                />
              </FieldBlock>
            </div>
          ))}
        </div>
      </section>

      {dipFields.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
            <Truck className="h-4 w-4 text-purple-600" /> Custom Grades
          </h3>
          <div className="space-y-3">
            {dipFields.map((f) => (
              <div key={f.id} className="grid grid-cols-2 gap-2">
                <FieldBlock label={`${f.label} (level)`}>
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={form[`custom_dip__${f.key}__level`] || ''}
                    onChange={(e) => handle(`custom_dip__${f.key}__level`, e.target.value)}
                    onBlur={() => onBlur(`custom_dip__${f.key}__level`)}
                    className="h-11"
                  />
                </FieldBlock>
                <FieldBlock label="Delivery">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    value={form[`custom_dip__${f.key}__delivery`] || ''}
                    onChange={(e) => handle(`custom_dip__${f.key}__delivery`, e.target.value)}
                    onBlur={() => onBlur(`custom_dip__${f.key}__delivery`)}
                    className="h-11"
                  />
                </FieldBlock>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-muted-foreground">All dip fields are optional — leave blank if nothing to record.</p>
    </div>
  );
}

function StepReview({ form, siteName, salesFields, dipFields }) {
  const filledSales = salesFields.filter((f) => form[f.key] !== '' && form[f.key] != null);
  const filledDips = [
    ['ULP 91', form.dip_ulp_litres, form.delivery_ulp_litres],
    ['Diesel', form.dip_diesel_litres, form.delivery_diesel_litres],
    ['Premium', form.dip_premium_litres, form.delivery_premium_litres],
  ].filter(([_, lvl, del]) => (lvl !== '' && lvl != null) || (del !== '' && del != null && del !== '0'));
  return (
    <div className="space-y-4 text-sm">
      <ReviewRow label="Site" value={siteName} />
      <ReviewRow label="Date" value={form.date} />
      <ReviewRow label="Shift" value={<Badge>{form.shift_type}</Badge>} />
      <div className="border rounded-lg p-3 bg-slate-50">
        <h4 className="font-semibold text-xs uppercase text-slate-500 mb-2">Sales & Payments</h4>
        {filledSales.length === 0 ? (
          <p className="text-xs text-muted-foreground">No values entered.</p>
        ) : (
          <div className="space-y-1">
            {filledSales.map((f) => (
              <div key={f.id} className="flex justify-between text-sm">
                <span className="text-slate-600">{f.label}</span>
                <span className="font-medium">{form[f.key]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border rounded-lg p-3 bg-slate-50">
        <h4 className="font-semibold text-xs uppercase text-slate-500 mb-2">Fuel Dips</h4>
        {filledDips.length === 0 ? (
          <p className="text-xs text-muted-foreground">No dip readings entered.</p>
        ) : (
          <div className="space-y-1">
            {filledDips.map(([name, lvl, del]) => (
              <div key={name} className="flex justify-between text-sm">
                <span className="text-slate-600">{name}</span>
                <span className="font-medium">Level: {lvl || '—'} · Delivery: {del || '0'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldBlock({ label, required, error, icon: Icon, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-400" />}
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
