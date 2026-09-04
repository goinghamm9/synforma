"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Collapsible, Tabs } from "radix-ui";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMPETITORS,
  DECISION_TIMELINES,
  FUNDING_STAGES,
  STAGES,
  createOpportunity,
  getAccount,
  getContactsForAccount,
  isIsoDate,
  type DecisionTimeline,
  type FundingStage,
  type Lead,
  type MeridianDb,
  type Opportunity,
  type Stage,
} from "../_lib/db";
import { opportunityRows } from "../_lib/opportunity-view";
import { useUi } from "../_lib/ui-version";
import { Button, DefinitionList, Field, inputClass, selectClass, textareaClass } from "./ui";
import { CrmDialog } from "./dialog";
import s from "../crm.module.css";

interface FormState {
  name: string;
  amount: string;
  closeDate: string;
  stage: Stage;
  decisionMakerContactId: string;
  fundingStage: FundingStage;
  decisionTimeline: DecisionTimeline;
  competitors: string[];
  nextStep: string;
  nextStepDate: string;
  notes: string;
}

type ErrorKey = "name" | "amount" | "closeDate" | "nextStepDate";
type Errors = Partial<Record<ErrorKey, string>>;

const STEPS = [
  { n: 1, title: "Basics" },
  { n: 2, title: "Qualification" },
  { n: 3, title: "Review" },
] as const;

type StepNumber = (typeof STEPS)[number]["n"];

const FIELD_NAMES: Record<ErrorKey, string> = {
  name: "name",
  amount: "amount",
  closeDate: "close-date",
  nextStepDate: "next-step-date",
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function OpportunityWizard({ db, lead }: { db: MeridianDb; lead: Lead }) {
  const router = useRouter();
  const { version, labels, prefix } = useUi();
  const account = getAccount(db, lead.accountId);
  const contacts = getContactsForAccount(db, lead.accountId);

  const [step, setStep] = React.useState<StepNumber>(1);
  const [form, setForm] = React.useState<FormState>(() => ({
    name: `${account ? account.name : lead.company} — ${lead.title}`,
    amount: "",
    closeDate: "",
    stage: "Prospecting",
    decisionMakerContactId: "",
    fundingStage: "Unknown",
    decisionTimeline: "Unknown",
    competitors: [],
    nextStep: "",
    nextStepDate: "",
    notes: "",
  }));
  const [errors, setErrors] = React.useState<Errors>({});
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const [qualificationTab, setQualificationTab] = React.useState<"core" | "additional">("core");
  const [reminderOpen, setReminderOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const fieldId = (name: string) => `${prefix}-${name}`;
  const fieldClass = `${prefix}-field`;
  const controlClass = (base: string) => cn(base, `${prefix}-input`);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    if (key in errors) {
      setErrors((current) => {
        const next = { ...current };
        delete next[key as ErrorKey];
        return next;
      });
    }
  }

  function toggleCompetitor(name: string, checked: boolean) {
    setForm((current) => {
      let next = checked ? [...current.competitors, name] : current.competitors.filter((c) => c !== name);
      if (checked && name === "None identified") next = ["None identified"];
      else if (checked) next = next.filter((c) => c !== "None identified");
      return { ...current, competitors: next };
    });
  }

  function focusField(key: ErrorKey) {
    window.setTimeout(() => {
      document.getElementById(fieldId(FIELD_NAMES[key]))?.focus();
    }, 0);
  }

  function validateBasics(): Errors {
    const next: Errors = {};
    if (!form.name.trim()) next.name = "Enter an opportunity name";
    if (!form.amount.trim()) next.amount = "Enter an amount";
    else if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) next.amount = "Enter an amount greater than 0";
    if (!form.closeDate) next.closeDate = "Select an expected close date";
    return next;
  }

  function validateQualification(): Errors {
    const next: Errors = {};
    const value = form.nextStepDate.trim();
    if (value && !isIsoDate(value)) next.nextStepDate = "Enter the date as YYYY-MM-DD";
    return next;
  }

  function goNext() {
    if (step === 1) {
      const next = validateBasics();
      setErrors(next);
      const first = (Object.keys(next) as ErrorKey[])[0];
      if (first) {
        focusField(first);
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      const next = validateQualification();
      setErrors(next);
      if (next.nextStepDate) {
        setAdvancedOpen(true);
        setQualificationTab("additional");
        focusField("nextStepDate");
        return;
      }
      setStep(3);
      setReminderOpen(true);
    }
  }

  function goBack() {
    setErrors({});
    setStep((current) => (current === 3 ? 2 : 1));
  }

  function create() {
    if (submitting) return;
    setSubmitting(true);
    const created = createOpportunity({
      name: form.name.trim(),
      accountId: lead.accountId,
      amount: Number(form.amount),
      closeDate: form.closeDate,
      stage: form.stage,
      decisionMakerContactId: form.decisionMakerContactId,
      fundingStage: form.fundingStage,
      decisionTimeline: form.decisionTimeline,
      competitors: form.competitors,
      nextStep: form.nextStep.trim(),
      nextStepDate: form.nextStepDate.trim(),
      notes: form.notes.trim(),
      sourceLeadId: lead.id,
      owner: lead.owner,
    });
    router.push(`/sandbox/crm/opportunities/${created.id}?created=1`);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 3) create();
    else goNext();
  }

  const draft: Opportunity = {
    id: "",
    name: form.name.trim(),
    accountId: lead.accountId,
    amount: Number(form.amount) || 0,
    closeDate: form.closeDate,
    stage: form.stage,
    decisionMakerContactId: form.decisionMakerContactId,
    fundingStage: form.fundingStage,
    decisionTimeline: form.decisionTimeline,
    competitors: form.competitors,
    nextStep: form.nextStep.trim(),
    nextStepDate: form.nextStepDate.trim(),
    notes: form.notes.trim(),
    createdAt: "",
    sourceLeadId: lead.id,
    owner: lead.owner,
  };
  const reviewRows = opportunityRows(db, draft, labels).filter((row) => row.key !== "id" && row.key !== "createdAt");

  const current = STEPS[step - 1];

  // ─────────── Field groups ───────────

  const coreQualificationFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id={fieldId("decision-maker")} label={labels.decisionMaker} className={fieldClass}>
        {({ id }) => (
          <select
            id={id}
            name="decisionMakerContactId"
            className={controlClass(selectClass)}
            value={form.decisionMakerContactId}
            onChange={(event) => update("decisionMakerContactId", event.target.value)}
          >
            <option value="">Select a contact</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name} — {contact.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field id={fieldId("funding-stage")} label={labels.fundingStage} className={fieldClass}>
        {({ id }) => (
          <select
            id={id}
            name="fundingStage"
            className={controlClass(selectClass)}
            value={form.fundingStage}
            onChange={(event) => update("fundingStage", event.target.value as FundingStage)}
          >
            {FUNDING_STAGES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field id={fieldId("decision-timeline")} label={labels.decisionTimeline} className={fieldClass}>
        {({ id }) => (
          <select
            id={id}
            name="decisionTimeline"
            className={controlClass(selectClass)}
            value={form.decisionTimeline}
            onChange={(event) => update("decisionTimeline", event.target.value as DecisionTimeline)}
          >
            {DECISION_TIMELINES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}
      </Field>
    </div>
  );

  const advancedFields = (
    <div className="grid gap-4">
      <fieldset className={cn(s.fieldset, fieldClass)}>
        <legend className={s.legend}>Competitors</legend>
        <div className="grid gap-0.5 sm:grid-cols-2">
          {COMPETITORS.map((competitor) => {
            const id = fieldId(`competitor-${slug(competitor)}`);
            return (
              <label key={competitor} htmlFor={id} className={s.check}>
                <input
                  id={id}
                  type="checkbox"
                  name="competitors"
                  value={competitor}
                  className={`${prefix}-checkbox`}
                  checked={form.competitors.includes(competitor)}
                  onChange={(event) => toggleCompetitor(competitor, event.target.checked)}
                />
                {competitor}
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={fieldId("next-step")} label={labels.nextStep} className={fieldClass}>
          {({ id }) => (
            <input
              id={id}
              type="text"
              name="nextStep"
              className={controlClass(inputClass)}
              value={form.nextStep}
              onChange={(event) => update("nextStep", event.target.value)}
            />
          )}
        </Field>
        <Field
          id={fieldId("next-step-date")}
          label={labels.nextStepDate}
          help="Format: YYYY-MM-DD"
          error={errors.nextStepDate}
          className={fieldClass}
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="text"
              name="nextStepDate"
              inputMode="numeric"
              placeholder="YYYY-MM-DD"
              className={controlClass(inputClass)}
              value={form.nextStepDate}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              onChange={(event) => update("nextStepDate", event.target.value)}
            />
          )}
        </Field>
      </div>
    </div>
  );

  const notesField = (
    <Field id={fieldId("notes")} label="Qualification notes" className={fieldClass}>
      {({ id }) => (
        <textarea
          id={id}
          name="notes"
          className={controlClass(textareaClass)}
          value={form.notes}
          onChange={(event) => update("notes", event.target.value)}
          rows={4}
        />
      )}
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className={cn(s.card, "mx-auto max-w-[820px]")} aria-labelledby={`${prefix}-wizard-heading`}>
      <div className={cn(s.cardHeader, "flex-col items-stretch gap-2 sm:flex-row sm:items-center")}>
        <p className="m-0 text-[13px] font-semibold" aria-live="polite">
          Step {step} of 3 · {current.title}
        </p>
        <ol className={cn(s.stepper, "m-0 list-none p-0 sm:w-64")} aria-hidden="true">
          {STEPS.map((item, index) => (
            <React.Fragment key={item.n}>
              {index > 0 ? <li className={s.stepLine} /> : null}
              <li className={item.n === step ? s.stepDotActive : item.n < step ? s.stepDotDone : s.stepDot} title={item.title}>
                {item.n}
              </li>
            </React.Fragment>
          ))}
        </ol>
      </div>

      <div className={s.cardBody}>
        {step === 1 ? (
          <section aria-labelledby={`${prefix}-step-1-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-1-heading`} className={s.h2}>
              Basics
            </h2>
            <Field id={fieldId("name")} label="Opportunity name" required error={errors.name} className={fieldClass}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  type="text"
                  name="name"
                  required
                  className={controlClass(inputClass)}
                  value={form.name}
                  aria-invalid={invalid || undefined}
                  aria-describedby={describedBy}
                  onChange={(event) => update("name", event.target.value)}
                />
              )}
            </Field>
            <Field id={fieldId("account")} label="Account" className={fieldClass}>
              {({ id }) => (
                <input id={id} type="text" name="account" readOnly className={controlClass(inputClass)} value={account ? account.name : lead.company} />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={fieldId("amount")} label="Amount" required error={errors.amount} className={fieldClass}>
                {({ id, describedBy, invalid }) => (
                  <div className={s.adorn}>
                    <span className={s.adornLabel} aria-hidden="true">
                      USD
                    </span>
                    <input
                      id={id}
                      type="number"
                      name="amount"
                      required
                      min={0}
                      step={1}
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
              <Field id={fieldId("close-date")} label="Expected close date" required error={errors.closeDate} className={fieldClass}>
                {({ id, describedBy, invalid }) => (
                  <input
                    id={id}
                    type="date"
                    name="closeDate"
                    required
                    className={controlClass(inputClass)}
                    value={form.closeDate}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => update("closeDate", event.target.value)}
                  />
                )}
              </Field>
            </div>
            <Field id={fieldId("stage")} label="Stage" className={cn(fieldClass, "sm:max-w-[50%]")}>
              {({ id }) => (
                <select
                  id={id}
                  name="stage"
                  className={controlClass(selectClass)}
                  value={form.stage}
                  onChange={(event) => update("stage", event.target.value as Stage)}
                >
                  {STAGES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-labelledby={`${prefix}-step-2-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-2-heading`} className={s.h2}>
              Qualification
            </h2>
            {version === "v1" ? (
              <>
                {coreQualificationFields}
                <Collapsible.Root open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <Collapsible.Trigger className={s.collapsibleTrigger}>
                    <ChevronDown className={s.chevron} size={16} aria-hidden="true" />
                    {labels.advancedSection}
                  </Collapsible.Trigger>
                  <Collapsible.Content className={s.collapsibleContent}>{advancedFields}</Collapsible.Content>
                </Collapsible.Root>
                {notesField}
              </>
            ) : (
              <Tabs.Root value={qualificationTab} onValueChange={(value) => setQualificationTab(value === "additional" ? "additional" : "core")}>
                <Tabs.List className={s.tabList} aria-label="Qualification sections">
                  <Tabs.Trigger value="core" className={s.tab}>
                    {labels.coreTab}
                  </Tabs.Trigger>
                  <Tabs.Trigger value="additional" className={s.tab}>
                    {labels.advancedSection}
                  </Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="core" className={cn(s.tabPanel, "grid gap-4")}>
                  {coreQualificationFields}
                  {notesField}
                </Tabs.Content>
                <Tabs.Content value="additional" className={s.tabPanel}>
                  {advancedFields}
                </Tabs.Content>
              </Tabs.Root>
            )}
          </section>
        ) : null}

        {step === 3 ? (
          <section aria-labelledby={`${prefix}-step-3-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-3-heading`} className={s.h2}>
              Review
            </h2>
            <p className={cn(s.muted, "m-0")}>Check the details below before saving. You can go back to change any value.</p>
            <DefinitionList rows={reviewRows.map((row) => ({ label: row.label, value: row.value }))} />
          </section>
        ) : null}
      </div>

      <div className={cn(s.dialogFooter, "flex-wrap justify-between")}>
        <div>
          {step === 1 ? (
            <Link href={`/sandbox/crm/leads/${lead.id}`} className={s.btnSecondary}>
              Cancel
            </Link>
          ) : (
            <Button type="button" onClick={goBack}>
              {labels.back}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {step < 3 ? (
            <Button type="submit" variant="primary">
              {labels.next}
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving…" : labels.create}
            </Button>
          )}
        </div>
      </div>

      <CrmDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        title="Data quality reminder"
        description="Opportunities missing qualification details are excluded from forecasting."
        requireAction
        footer={
          <Button type="button" variant="primary" onClick={() => setReminderOpen(false)}>
            I understand
          </Button>
        }
      />
    </form>
  );
}
