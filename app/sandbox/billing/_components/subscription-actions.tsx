"use client";
import * as React from "react";
import { PAUSE_REASONS, pauseSubscription, resumeSubscription, type Customer, type PauseReason } from "../_lib/db";
import { useUi } from "../_lib/ui-version";
import { Button, Field, selectClass, textareaClass } from "./ui";
import { BillingDialog } from "./dialog";

/** "Pause subscription" / "Resume subscription" with a confirmation dialog that asks for a reason. */
export function SubscriptionActions({ customer, onNotice }: { customer: Customer; onNotice: (text: string) => void }) {
  const { prefix } = useUi();
  const [pauseOpen, setPauseOpen] = React.useState(false);
  const [resumeOpen, setResumeOpen] = React.useState(false);
  const [reason, setReason] = React.useState<"" | PauseReason>("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState("");
  const paused = customer.subscription.status === "Paused";

  function openPause() {
    setReason("");
    setNote("");
    setError("");
    setPauseOpen(true);
  }

  function confirmPause() {
    if (!reason) {
      setError("Select a pause reason");
      window.setTimeout(() => document.getElementById(`${prefix}-pause-reason`)?.focus(), 0);
      return;
    }
    pauseSubscription(customer.id, reason, note);
    setPauseOpen(false);
    onNotice(`Subscription paused — ${reason}.`);
  }

  return (
    <>
      {paused ? (
        <Button variant="primary" onClick={() => setResumeOpen(true)}>
          Resume subscription
        </Button>
      ) : (
        <Button onClick={openPause} disabled={customer.subscription.status === "Canceled"}>
          Pause subscription
        </Button>
      )}

      <BillingDialog
        open={pauseOpen}
        onOpenChange={setPauseOpen}
        title="Pause subscription"
        description={`Pause the ${customer.subscription.plan} plan for ${customer.name}? No invoices are issued while a subscription is paused.`}
        footer={
          <>
            <Button type="button" onClick={() => setPauseOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={confirmPause}>
              Pause subscription
            </Button>
          </>
        }
      >
        <div className="mt-4 grid gap-4">
          <Field id={`${prefix}-pause-reason`} label="Pause reason" required error={error}>
            {({ id, describedBy, invalid }) => (
              <select
                id={id}
                name="pauseReason"
                className={selectClass}
                value={reason}
                aria-invalid={invalid || undefined}
                aria-describedby={describedBy}
                onChange={(event) => {
                  setReason(event.target.value as "" | PauseReason);
                  setError("");
                }}
              >
                <option value="">Select a reason</option>
                {PAUSE_REASONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id={`${prefix}-pause-note`} label="Internal note" help="Visible to your team only.">
            {({ id }) => <textarea id={id} name="pauseNote" rows={3} className={textareaClass} value={note} onChange={(event) => setNote(event.target.value)} />}
          </Field>
        </div>
      </BillingDialog>

      <BillingDialog
        open={resumeOpen}
        onOpenChange={setResumeOpen}
        title="Resume subscription"
        description={`Resume the ${customer.subscription.plan} plan for ${customer.name}? Billing continues from the next invoice date.`}
        footer={
          <>
            <Button type="button" onClick={() => setResumeOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                resumeSubscription(customer.id);
                setResumeOpen(false);
                onNotice("Subscription resumed.");
              }}
            >
              Resume subscription
            </Button>
          </>
        }
      />
    </>
  );
}
