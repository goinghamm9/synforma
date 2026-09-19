"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { approveRequisition, formatCurrency, requisitionTotal, returnRequisition, type Requisition } from "../_lib/db";
import { useUi } from "../_lib/ui-version";
import { Button, Field, textareaClass } from "./ui";
import { ErpDialog } from "./dialog";
import s from "../erp.module.css";

export type DecisionMode = "approve" | "return" | null;
export type DecisionOutcome = "approved" | "returned";

/** Row menu for a submitted requisition: Approve, Return with comment, Open. */
export function RequisitionRowMenu({
  requisition,
  onApprove,
  onReturn,
}: {
  requisition: Requisition;
  onApprove: () => void;
  onReturn: () => void;
}) {
  const router = useRouter();
  const { labels } = useUi();
  // Open dialogs on the next tick so the menu finishes closing and returns focus first.
  const later = (fn: () => void) => () => {
    window.setTimeout(fn, 0);
  };
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className={`${s.btnSecondary} ${s.btnSm}`} aria-label={`Actions for ${requisition.id}`}>
          Actions
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={s.menuContent} align="end" sideOffset={4}>
          <DropdownMenu.Item className={s.menuItem} onSelect={later(onApprove)}>
            {labels.approve}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={s.menuItem} onSelect={later(onReturn)}>
            {labels.returnWithComment}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={s.menuSeparator} />
          <DropdownMenu.Item className={s.menuItem} onSelect={() => router.push(`/sandbox/erp/requisitions/${requisition.id}`)}>
            Open requisition
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** The Approve and Return dialogs for one requisition. */
export function DecisionDialogs({
  requisition,
  mode,
  onClose,
  onDone,
}: {
  requisition: Requisition | undefined;
  mode: DecisionMode;
  onClose: () => void;
  onDone: (outcome: DecisionOutcome, requisition: Requisition) => void;
}) {
  const { labels } = useUi();
  const [approvalComment, setApprovalComment] = React.useState("");
  const [returnComment, setReturnComment] = React.useState("");
  const [returnError, setReturnError] = React.useState("");

  const close = () => {
    setApprovalComment("");
    setReturnComment("");
    setReturnError("");
    onClose();
  };

  const summary = requisition ? `${requisition.id} · ${requisition.description} · ${formatCurrency(requisitionTotal(requisition))}` : "";

  function approve(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requisition) return;
    approveRequisition(requisition.id, approvalComment);
    const done = requisition;
    close();
    onDone("approved", done);
  }

  function sendBack(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requisition) return;
    if (!returnComment.trim()) {
      setReturnError("Enter a comment for the requester");
      window.setTimeout(() => document.getElementById("return-comment")?.focus(), 0);
      return;
    }
    returnRequisition(requisition.id, returnComment);
    const done = requisition;
    close();
    onDone("returned", done);
  }

  return (
    <>
      <ErpDialog
        open={mode === "approve" && Boolean(requisition)}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title="Approve requisition"
        description={`${summary}. The requisition is released for ordering.`}
      >
        <form onSubmit={approve} noValidate className="mt-4 grid gap-4">
          <Field id="approval-comment" label="Approval comment" help="Optional. Shown in the approval history.">
            {({ id, describedBy }) => (
              <textarea
                id={id}
                name="approvalComment"
                rows={3}
                className={textareaClass}
                value={approvalComment}
                aria-describedby={describedBy}
                onChange={(event) => setApprovalComment(event.target.value)}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              {labels.approve}
            </Button>
          </div>
        </form>
      </ErpDialog>

      <ErpDialog
        open={mode === "return" && Boolean(requisition)}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title="Return requisition"
        description={`${summary}. The requisition goes back to ${requisition?.requestedBy ?? "the requester"} with your comment.`}
      >
        <form onSubmit={sendBack} noValidate className="mt-4 grid gap-4">
          <Field id="return-comment" label="Return comment" required error={returnError} help="Tell the requester what to change before resubmitting.">
            {({ id, describedBy, invalid }) => (
              <textarea
                id={id}
                name="returnComment"
                rows={4}
                required
                className={textareaClass}
                value={returnComment}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                onChange={(event) => {
                  setReturnComment(event.target.value);
                  if (returnError) setReturnError("");
                }}
              />
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Return
            </Button>
          </div>
        </form>
      </ErpDialog>
    </>
  );
}
