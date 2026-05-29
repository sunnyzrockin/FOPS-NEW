'use client';

/**
 * <FieldTooltip />
 *
 * A tiny info-icon button that opens a popover with help text for a
 * specific field. Usage:
 *
 *   <Label>Opening cash <FieldTooltip id="shift.opening_cash" /></Label>
 *
 * or, for ad-hoc text:
 *
 *   <FieldTooltip text="Total litres dispensed during your shift" />
 *
 * We use Popover (click-to-open) instead of Tooltip (hover) because tooltips
 * are awkward on touch devices and not great for multi-line help text.
 */

import { HelpCircle } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { helpFor } from '@/lib/help-content';
import { cn } from '@/lib/utils';

export function FieldTooltip({ id, text, className }) {
  const content = text || (id ? helpFor(id) : null);
  if (!content) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="More info"
          className={cn(
            'inline-flex h-4 w-4 items-center justify-center rounded-full',
            'text-muted-foreground hover:text-blue-600 transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-blue-500/40',
            'align-middle ml-1',
            className
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-72 text-sm leading-relaxed"
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}

export default FieldTooltip;
