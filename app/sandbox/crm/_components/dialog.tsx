"use client";
import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import s from "../crm.module.css";

export interface CrmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** When true, clicking the backdrop does not close the dialog (the user must use a button). */
  requireAction?: boolean;
  className?: string;
}

export function CrmDialog({ open, onOpenChange, title, description, children, footer, requireAction, className }: CrmDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={s.overlay} />
        <DialogPrimitive.Content
          className={cn(s.dialog, className)}
          onPointerDownOutside={requireAction ? (event) => event.preventDefault() : undefined}
          onInteractOutside={requireAction ? (event) => event.preventDefault() : undefined}
          aria-describedby={description ? undefined : undefined}
        >
          <div className={s.dialogHeader}>
            <DialogPrimitive.Title className={s.dialogTitle}>{title}</DialogPrimitive.Title>
          </div>
          <div className={s.dialogBody}>
            {description ? <DialogPrimitive.Description className="m-0">{description}</DialogPrimitive.Description> : null}
            {children}
          </div>
          {footer ? <div className={s.dialogFooter}>{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const DialogClose = DialogPrimitive.Close;
