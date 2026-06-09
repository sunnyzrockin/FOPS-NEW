'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

/**
 * SiteFilter — Multi-select site picker used in Owner/Operator dashboards
 * and the Owner Executive Dashboard.
 *
 * Props:
 *   sites      = [{ id, name, code }, ...]  // the caller's allowed sites
 *   selectedIds = Set<string> | Array<string>
 *   onChange    = (newSelectedIds: string[]) => void
 *
 * Behaviour:
 *   - Default "All sites" → empty selection means caller should send
 *     every allowed site id (managed by the parent component).
 *   - Provides "Select all" and "Clear" affordances.
 *   - Label collapses to a count when more than 2 sites are chosen
 *     ("3 sites").
 *
 * Server-side intersection (getAllowedSiteIds) still guarantees safety —
 * this component just narrows what the caller sends.
 */
export default function SiteFilter({ sites = [], selectedIds = [], onChange }) {
  const [open, setOpen] = useState(false);
  const selectedSet = new Set(selectedIds);
  const allSelected = sites.length > 0 && selectedSet.size === sites.length;
  const noneSelected = selectedSet.size === 0;

  const toggle = (id) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const selectAll = () => onChange(sites.map((s) => s.id));
  const clearAll = () => onChange([]);

  const buttonLabel = (() => {
    if (noneSelected || allSelected) return 'All sites';
    if (selectedSet.size === 1) {
      const found = sites.find((s) => s.id === [...selectedSet][0]);
      return found?.name || '1 site';
    }
    if (selectedSet.size === 2) {
      const names = sites
        .filter((s) => selectedSet.has(s.id))
        .map((s) => s.name);
      return names.join(', ');
    }
    return `${selectedSet.size} sites`;
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[220px] justify-between"
        >
          <span className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{buttonLabel}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <div className="p-2 border-b flex items-center justify-between text-xs">
          <button
            type="button"
            className="font-medium text-teal-700 hover:underline"
            onClick={selectAll}
          >
            Select all
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:underline"
            onClick={clearAll}
          >
            Clear
          </button>
        </div>
        <ScrollArea className="max-h-[260px]">
          <ul className="py-1">
            {sites.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                No sites available
              </li>
            )}
            {sites.map((site) => {
              const checked = selectedSet.has(site.id);
              return (
                <li key={site.id}>
                  <label
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer',
                      'hover:bg-muted/50',
                      checked && 'bg-teal-50/40'
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(site.id)}
                      aria-label={`Toggle ${site.name}`}
                    />
                    <span className="flex-1 truncate">
                      <span className="font-medium">{site.name}</span>
                      {site.code && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({site.code})
                        </span>
                      )}
                    </span>
                    {checked && (
                      <Check className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
