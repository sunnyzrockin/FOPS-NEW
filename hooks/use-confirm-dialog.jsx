'use client';

import { useCallback, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

/**
 * useConfirmDialog
 *
 * Drop-in replacement for `window.confirm()`. Returns:
 *   {
 *     confirm(title, message, { confirmLabel?, cancelLabel?, destructive? }) → Promise<boolean>,
 *     ConfirmDialog: <Component /> to render once in your JSX,
 *   }
 *
 * Example:
 *   const { confirm, ConfirmDialog } = useConfirmDialog();
 *   const handleDelete = async () => {
 *     const ok = await confirm('Delete this formula?',
 *       'This action cannot be undone.',
 *       { confirmLabel: 'Delete', destructive: true });
 *     if (!ok) return;
 *     // ...proceed with delete
 *   };
 *   // ...JSX:
 *   <>
 *     <Button onClick={handleDelete}>Delete</Button>
 *     <ConfirmDialog />
 *   </>
 */
export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState({
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    destructive: false,
  });

  // The Promise resolve handle is stored in a ref so it survives renders.
  const resolveRef = useRef(null);

  const confirm = useCallback(
    (title, message = '', opts = {}) => {
      setConfig({
        title,
        message,
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        destructive: opts.destructive || false,
      });
      setOpen(true);
      return new Promise((resolve) => {
        resolveRef.current = resolve;
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    setOpen(false);
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
    }
  }, []);

  const handleCancel = useCallback((isOpen) => {
    if (!isOpen) {
      setOpen(false);
      if (resolveRef.current) {
        resolveRef.current(false);
        resolveRef.current = null;
      }
    }
  }, []);

  const ConfirmDialog = useCallback(
    () => (
      <AlertDialog open={open} onOpenChange={handleCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{config.title}</AlertDialogTitle>
            {config.message && (
              <AlertDialogDescription className="whitespace-pre-line">
                {config.message}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{config.cancelLabel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(
                config.destructive &&
                  'bg-destructive text-destructive-foreground hover:bg-destructive/90'
              )}
            >
              {config.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
    [open, config, handleCancel, handleConfirm]
  );

  return { confirm, ConfirmDialog };
}

export default useConfirmDialog;
