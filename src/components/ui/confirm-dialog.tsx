'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';
import { Button } from './button';

/**
 * Confirmation before anything that cannot be undone.
 *
 * The confirm button carries the verb rather than the word "Confirm", because
 * "Delete Lincoln Beach Center" is read and "Confirm" is clicked past.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = true,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
        <DialogDescription asChild>
          <div className="text-sm text-neutral-600">{description}</div>
        </DialogDescription>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? 'Working' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
