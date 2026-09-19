"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tabs } from "radix-ui";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DISPUTE_STATUSES,
  REFUND_REASONS,
  createRefund,
  daysSince,
  formatDate,
  formatMoney,
  getCustomer,
  isCaseReference,
  parseMoney,
  refundableAmount,
  type BillingDb,
  type DisputeStatus,
  type Payment,
  type RefundReason,
} from "../_lib/db";
import { useUi, type UiVersion } from "../_lib/ui-version";
import { Button, DefinitionList, Field, inputClass, selectClass, textareaClass } from "./ui";
import s from "../billing.module.css";

interface FormState {
  amount: string;
  reason: "" | RefundReason;
  note: string;
  caseReference: string;
  disputeStatus: DisputeStatus;
  confirmed: boolean;
}

type ErrorKey = "amount" | "reason" | "note" | "caseReference" | "confirmed";
type Errors = Partial<Record<ErrorKey, string>>;

type StepKey = "amount" | "note" | "case" | "review";

interface Step {
  key: StepKey;
  title: string;
}

/** v1 has a dedicated "Customer note" step; v2 moves the note into a tab of the review step. */
const STEPS: Record<UiVersion, Step[]> = {
  v1: [
    { key: "amount", title: "Amount and reason" },
    { key: "note", title: "Customer note" },
    { key: "case", title: "Case details" },
    { key: "review", title: "Review" },
  ],
  v2: [
    { key: "amount", title: "Amount and reason" },
    { key: "case", title: "Case details" },
    { key: "review", title: "Review" },
  ],
};

const FIELD_NAMES: Record<ErrorKey, string> = {
  amount: "amount",
  reason: "refund-reason",
  note: "customer-note",
  caseReference: "case-reference",
  confirmed: "policy-confirmation",
};

/** Charges older than this many days need a manager's approval before a refund (policy shown, not enforced). */
const POLICY_MAX_AGE_DAYS = 90;

export function RefundWizard({ db, payment }: { db: BillingDb; payment: Payment }) {
  const router = useRouter();
  const { version, labels, prefix } = useUi();
  const steps = STEPS[version];
  const customer = getCustomer(db, payment.customerId);
  const remaining = refundableAmount(payment);
  const chargeAge = daysSince(payment.createdAt);

  const [stepIndex, setStepIndex] = React.useState(0);
  const [form, setForm] = React.useState<FormState>(() => ({
    amount: remaining.toFixed(2),
    reason: "",
    note: "",
    caseReference: "",
    disputeStatus: payment.dispute ? payment.dispute.status : "Open",
    confirmed: false,
  }));
  const [errors, setErrors] = React.useState<Errors>({});
  const [reviewTab, setReviewTab] = React.useState<"summary" | "note">("summary");
  const [submitting, setSubmitting] = React.useState(false);

  const index = Math.min(stepIndex, steps.length - 1);
  const current = steps[index];
  const isLast = index === steps.length - 1;

  const fieldId = (name: string) => `${prefix}-${name}`;
  const fieldClass = `${prefix}-field`;
  const controlClass = (base: string) => cn(base, `${prefix}-input`);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key in errors) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key as ErrorKey];
        return next;
      });
    }
  }

  function focusField(key: ErrorKey) {
    window.setTimeout(() => {
      document.getElementById(fieldId(FIELD_NAMES[key]))?.focus();
    }, 0);
  }

  function validateAmountStep(): Errors {
    const next: Errors = {};
    const amount = parseMoney(form.amount);
    if (!form.amount.trim() || Number.isNaN(amount)) next.amount = "Enter an amount such as 120.00";
    else if (amount <= 0) next.amount = "Enter an amount greater than 0";
    else if (amount > remaining) next.amount = "Amount cannot exceed the original charge";
    if (!form.reason) next.reason = `Select a ${labels.refundReason.toLowerCase()}`;
    return next;
  }

  function validateNote(): Errors {
    return form.note.trim() ? {} : { note: "Enter a note to the customer" };
  }

  function validateCaseStep(): Errors {
    return isCaseReference(form.caseReference) ? {} : { caseReference: "Enter the case reference as CS-1234" };
  }

  function validateReview(): Errors {
    const next: Errors = version === "v2" ? validateNote() : {};
    if (!form.confirmed) next.confirmed = "Confirm that the refund follows the refund policy";
    return next;
  }

  function applyErrors(next: Errors): boolean {
    setErrors(next);
    const first = (Object.keys(next) as ErrorKey[])[0];
    if (!first) return true;
    if (first === "note" && version === "v2") setReviewTab("note");
    focusField(first);
    return false;
  }

  function goNext() {
    const validators: Record<StepKey, () => Errors> = {
      amount: validateAmountStep,
      note: validateNote,
      case: validateCaseStep,
      review: validateReview,
    };
    if (!applyErrors(validators[current.key]())) return;
    setStepIndex(index + 1);
  }

  function goBack() {
    setErrors({});
    setStepIndex(Math.max(0, index - 1));
  }

  function issue() {
    if (submitting) return;
    if (!applyErrors(validateReview())) return;
    setSubmitting(true);
    const refund = createRefund({
      paymentId: payment.id,
      amount: parseMoney(form.amount),
      reason: form.reason as RefundReason,
      customerNote: form.note,
      caseReference: form.caseReference.trim().toUpperCase(),
      disputeStatus: form.disputeStatus,
    });
    router.push(`/sandbox/billing/refunds/${refund.id}?created=1`);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLast) issue();
    else goNext();
  }

  const amountValue = parseMoney(form.amount);
  const summaryRows = [
    { label: "Payment", value: payment.id },
    { label: "Customer", value: customer ? customer.name : payment.customerId },
    { label: "Original charge", value: formatMoney(payment.amount) },
    { label: "Amount", value: Number.isNaN(amountValue) ? form.amount : formatMoney(amountValue) },
    { label: labels.refundReason, value: form.reason },
    ...(version === "v1" ? [{ label: "Note to customer", value: form.note.trim() }] : []),
    { label: "Case reference", value: form.caseReference.trim().toUpperCase() },
    { label: "Dispute status", value: payment.dispute ? form.disputeStatus : "No dispute" },
  ];

  // ─────────── Fields ───────────

  const noteField = (
    <Field
      id={fieldId("customer-note")}
      label="Note to customer"
      required
      help="Included in the refund email the customer receives."
      error={errors.note}
      className={fieldClass}
    >
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          name="customerNote"
          required
          rows={4}
          className={controlClass(textareaClass)}
          value={form.note}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => update("note", event.target.value)}
        />
      )}
    </Field>
  );

  const confirmField = (
    <div className={fieldClass}>
      <label htmlFor={fieldId("policy-confirmation")} className={s.check}>
        <input
          id={fieldId("policy-confirmation")}
          type="checkbox"
          name="policyConfirmation"
          className={`${prefix}-checkbox`}
          checked={form.confirmed}
          aria-invalid={errors.confirmed ? true : undefined}
          aria-describedby={errors.confirmed ? `${fieldId("policy-confirmation")}-error` : undefined}
          onChange={(event) => update("confirmed", event.target.checked)}
        />
        <span>I confirm this refund follows the refund policy</span>
      </label>
      {errors.confirmed ? (
        <p id={`${fieldId("policy-confirmation")}-error`} role="alert" className={s.error}>
          {errors.confirmed}
        </p>
      ) : null}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className={cn(s.card, "mx-auto max-w-[760px]")} aria-labelledby={`${prefix}-wizard-heading`}>
      <div className={cn(s.cardHeader, "flex-col items-stretch gap-2 sm:flex-row sm:items-center")}>
        <p className="m-0 text-[13px] font-semibold" aria-live="polite">
          Step {index + 1} of {steps.length} · {current.title}
        </p>
        <ol className={cn(s.stepper, "m-0 list-none p-0 sm:w-56")} aria-hidden="true">
          {steps.map((item, i) => (
            <React.Fragment key={item.key}>
              {i > 0 ? <li className={s.stepLine} /> : null}
              <li className={i === index ? s.stepDotActive : i < index ? s.stepDotDone : s.stepDot} title={item.title}>
                {i + 1}
              </li>
            </React.Fragment>
          ))}
        </ol>
      </div>

      <div className={s.cardBody}>
        {current.key === "amount" ? (
          <section aria-labelledby={`${prefix}-step-amount-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-amount-heading`} className={s.h2}>
              Amount and reason
            </h2>
            <div className={cn(s.bannerInfo, "flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-between")}>
              <span>
                Original charge <strong className={s.num}>{formatMoney(payment.amount)}</strong>
                {payment.refundedAmount > 0 ? (
                  <>
                    {" · "}
                    <span className={s.num}>{formatMoney(payment.refundedAmount)}</span> already refunded
                  </>
                ) : null}
              </span>
              <span className="text-xs">
                Charged {formatDate(payment.createdAt)} · {chargeAge} {chargeAge === 1 ? "day" : "days"} ago
              </span>
            </div>
            {chargeAge > POLICY_MAX_AGE_DAYS ? (
              <div role="note" className={s.bannerWarning}>
                <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>
                  This charge is older than {POLICY_MAX_AGE_DAYS} days. Under the refund policy a manager must approve the refund before it is issued.
                </span>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id={fieldId("amount")} label="Amount" required help={`Up to ${formatMoney(remaining)}`} error={errors.amount} className={fieldClass}>
                {({ id, describedBy, invalid }) => (
                  <div className={s.adorn}>
                    <span className={s.adornLabel} aria-hidden="true">
                      USD
                    </span>
                    <input
                      id={id}
                      type="text"
                      name="amount"
                      required
                      inputMode="decimal"
                      className={controlClass(inputClass)}
                      value={form.amount}
                      aria-invalid={invalid || undefined}
                      aria-describedby={describedBy}
                      onChange={(event) => update("amount", event.target.value)}
                    />
                  </div>
                )}
              </Field>
              <Field id={fieldId("refund-reason")} label={labels.refundReason} required error={errors.reason} className={fieldClass}>
                {({ id, describedBy, invalid }) => (
                  <select
                    id={id}
                    name="refundReason"
                    required
                    className={controlClass(selectClass)}
                    value={form.reason}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => update("reason", event.target.value as FormState["reason"])}
                  >
                    <option value="">Select a reason</option>
                    {REFUND_REASONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
          </section>
        ) : null}

        {current.key === "note" ? (
          <section aria-labelledby={`${prefix}-step-note-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-note-heading`} className={s.h2}>
              Customer note
            </h2>
            <p className={cn(s.muted, "m-0")}>Tell the customer why the charge is being refunded.</p>
            {noteField}
          </section>
        ) : null}

        {current.key === "case" ? (
          <section aria-labelledby={`${prefix}-step-case-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-case-heading`} className={s.h2}>
              Case details
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id={fieldId("case-reference")} label="Case reference" required help="Format: CS-1234" error={errors.caseReference} className={fieldClass}>
                {({ id, describedBy, invalid }) => (
                  <input
                    id={id}
                    type="text"
                    name="caseReference"
                    required
                    placeholder="CS-1234"
                    className={controlClass(inputClass)}
                    value={form.caseReference}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => update("caseReference", event.target.value)}
                  />
                )}
              </Field>
              {payment.dispute ? (
                <Field id={fieldId("dispute-status")} label="Dispute status" help={`Dispute ${payment.dispute.id} · ${payment.dispute.reason}`} className={fieldClass}>
                  {({ id, describedBy }) => (
                    <select
                      id={id}
                      name="disputeStatus"
                      className={controlClass(selectClass)}
                      value={form.disputeStatus}
                      aria-describedby={describedBy}
                      onChange={(event) => update("disputeStatus", event.target.value as DisputeStatus)}
                    >
                      {DISPUTE_STATUSES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              ) : (
                <div className={fieldClass}>
                  <span className={s.label}>Dispute status</span>
                  <p className={cn(s.muted, "m-0 pt-1.5")}>This payment has no dispute.</p>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {current.key === "review" ? (
          <section aria-labelledby={`${prefix}-step-review-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-review-heading`} className={s.h2}>
              Review
            </h2>
            <p className={cn(s.muted, "m-0")}>Check the refund before issuing it. You can go back to change any value.</p>
            {version === "v1" ? (
              <DefinitionList rows={summaryRows} />
            ) : (
              <Tabs.Root value={reviewTab} onValueChange={(value) => setReviewTab(value === "note" ? "note" : "summary")}>
                <Tabs.List className={s.tabList} aria-label="Review sections">
                  <Tabs.Trigger value="summary" className={s.tab}>
                    {labels.summaryTab}
                  </Tabs.Trigger>
                  <Tabs.Trigger value="note" className={s.tab}>
                    {labels.customerNoteTab}
                  </Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="summary" className={s.tabPanel}>
                  <DefinitionList rows={summaryRows} />
                </Tabs.Content>
                <Tabs.Content value="note" className={cn(s.tabPanel, "grid gap-3")}>
                  <p className={cn(s.muted, "m-0")}>Tell the customer why the charge is being refunded.</p>
                  {noteField}
                </Tabs.Content>
              </Tabs.Root>
            )}
            {confirmField}
          </section>
        ) : null}
      </div>

      <div className={cn(s.dialogFooter, "flex-wrap justify-between")}>
        <div>
          {index === 0 ? (
            <Link href={`/sandbox/billing/payments/${payment.id}`} className={s.btnSecondary}>
              Cancel
            </Link>
          ) : (
            <Button type="button" onClick={goBack}>
              {labels.back}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {isLast ? (
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Issuing…" : labels.issueRefund}
            </Button>
          ) : (
            <Button type="submit" variant="primary">
              {labels.next}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
