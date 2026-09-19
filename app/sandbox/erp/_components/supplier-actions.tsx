"use client";
import * as React from "react";
import { PAYMENT_TERMS, updateSupplierPaymentTerms, type PaymentTerms, type Supplier } from "../_lib/db";
import { Button, Field, selectClass, textareaClass } from "./ui";
import { ErpDialog } from "./dialog";

/** "Edit payment terms" dialog: Payment terms (select) + Reason (textarea, required). */
export function EditPaymentTermsDialog({
  supplier,
  open,
  onOpenChange,
  onSaved,
}: {
  supplier: Supplier;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (from: PaymentTerms, to: PaymentTerms) => void;
}) {
  const [terms, setTerms] = React.useState<PaymentTerms>(supplier.paymentTerms);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState("");

  const close = () => {
    setTerms(supplier.paymentTerms);
    setReason("");
    setError("");
    onOpenChange(false);
  };

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reason.trim()) {
      setError("Enter a reason for the change");
      window.setTimeout(() => document.getElementById("payment-terms-reason")?.focus(), 0);
      return;
    }
    const from = supplier.paymentTerms;
    updateSupplierPaymentTerms(supplier.id, terms, reason);
    setReason("");
    setError("");
    onOpenChange(false);
    onSaved(from, terms);
  }

  return (
    <ErpDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Edit payment terms"
      description={`${supplier.id} · ${supplier.name}. The change is recorded in the supplier's change log.`}
    >
      <form onSubmit={save} noValidate className="mt-4 grid gap-4">
        <Field id="payment-terms" label="Payment terms" required>
          {({ id }) => (
            <select id={id} name="paymentTerms" className={selectClass} value={terms} onChange={(event) => setTerms(event.target.value as PaymentTerms)}>
              {PAYMENT_TERMS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id="payment-terms-reason" label="Reason" required error={error} help="Why the terms change, for the audit trail.">
          {({ id, describedBy, invalid }) => (
            <textarea
              id={id}
              name="reason"
              rows={4}
              required
              className={textareaClass}
              value={reason}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              onChange={(event) => {
                setReason(event.target.value);
                if (error) setError("");
              }}
            />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Save
          </Button>
        </div>
      </form>
    </ErpDialog>
  );
}
