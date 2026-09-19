"use client";
import * as React from "react";
import { PAID_REASONS, markInvoicePaid, type Invoice, type PaidReason } from "../_lib/db";
import { useUi } from "../_lib/ui-version";
import { Button, Field, inputClass, selectClass } from "./ui";
import { BillingDialog } from "./dialog";

/** "Mark as paid" with a confirmation dialog that asks for a reason and an optional reference. */
export function InvoiceActions({ invoice, onNotice }: { invoice: Invoice; onNotice: (text: string) => void }) {
  const { prefix } = useUi();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<"" | PaidReason>("");
  const [reference, setReference] = React.useState("");
  const [error, setError] = React.useState("");
  const payable = invoice.status === "Open" || invoice.status === "Past due";

  function openDialog() {
    setReason("");
    setReference("");
    setError("");
    setOpen(true);
  }

  function confirm() {
    if (!reason) {
      setError("Select how the invoice was paid");
      window.setTimeout(() => document.getElementById(`${prefix}-paid-reason`)?.focus(), 0);
      return;
    }
    markInvoicePaid(invoice.id, reason, reference);
    setOpen(false);
    onNotice(`Invoice ${invoice.id} marked as paid.`);
  }

  return (
    <>
      <Button variant="primary" onClick={openDialog} disabled={!payable}>
        Mark as paid
      </Button>

      <BillingDialog
        open={open}
        onOpenChange={setOpen}
        title="Mark invoice as paid"
        description={`Record invoice ${invoice.id} as paid outside of an online payment. The customer is notified by email.`}
        footer={
          <>
            <Button type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={confirm}>
              Mark as paid
            </Button>
          </>
        }
      >
        <div className="mt-4 grid gap-4">
          <Field id={`${prefix}-paid-reason`} label="Reason" required error={error}>
            {({ id, describedBy, invalid }) => (
              <select
                id={id}
                name="paidReason"
                className={selectClass}
                value={reason}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                onChange={(event) => {
                  setReason(event.target.value as "" | PaidReason);
                  setError("");
                }}
              >
                <option value="">Select a reason</option>
                {PAID_REASONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id={`${prefix}-paid-reference`} label="Payment reference" help="Optional: bank reference or check number.">
            {({ id }) => <input id={id} type="text" name="paidReference" className={inputClass} value={reference} onChange={(event) => setReference(event.target.value)} />}
          </Field>
        </div>
      </BillingDialog>
    </>
  );
}
