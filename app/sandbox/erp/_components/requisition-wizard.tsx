"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tabs } from "radix-ui";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MATERIAL_GROUPS,
  costCenterLabel,
  countSentences,
  createRequisition,
  daysFromToday,
  formatCurrency,
  type AtlasDb,
  type MaterialGroup,
} from "../_lib/db";
import { itemLine } from "../_lib/requisition-view";
import { useUi } from "../_lib/ui-version";
import { ActionBar, Button, DefinitionList, Field, inputClass, selectClass, textareaClass } from "./ui";
import s from "../erp.module.css";

const MIN_DELIVERY_DAYS = 10;

interface ItemForm {
  key: number;
  description: string;
  quantity: string;
  unitPrice: string;
  deliveryDate: string;
}

interface FormState {
  description: string;
  costCenterId: string;
  materialGroup: MaterialGroup | "";
  items: ItemForm[];
  justification: string;
  notSplit: boolean;
}

type ItemErrorKey = "description" | "quantity" | "unitPrice" | "deliveryDate";
type ItemErrors = Partial<Record<ItemErrorKey, string>>;

interface Errors {
  description?: string;
  costCenterId?: string;
  materialGroup?: string;
  items?: Record<number, ItemErrors>;
  justification?: string;
}

type StepKey = "general" | "items" | "justification" | "review";

const ITEM_FIELD_NAMES: Record<ItemErrorKey, string> = {
  description: "description",
  quantity: "quantity",
  unitPrice: "unit-price",
  deliveryDate: "delivery-date",
};

function emptyItem(key: number): ItemForm {
  return { key, description: "", quantity: "", unitPrice: "", deliveryDate: "" };
}

function hasErrors(errors: Errors): boolean {
  return Boolean(errors.description || errors.costCenterId || errors.materialGroup || errors.justification || (errors.items && Object.keys(errors.items).length));
}

export function RequisitionWizard({ db }: { db: AtlasDb }) {
  const router = useRouter();
  const { version, labels, prefix } = useUi();

  // Release 24.1 has a separate Justification step; the 24.2 preview folds it into a tab of the Review step.
  const steps: { key: StepKey; title: string }[] =
    version === "v2"
      ? [
          { key: "general", title: labels.generalStep },
          { key: "items", title: labels.itemsStep },
          { key: "review", title: labels.reviewStep },
        ]
      : [
          { key: "general", title: labels.generalStep },
          { key: "items", title: labels.itemsStep },
          { key: "justification", title: labels.justificationStep },
          { key: "review", title: labels.reviewStep },
        ];

  const [rawStepIndex, setStepIndex] = React.useState(0);
  const stepIndex = Math.min(rawStepIndex, steps.length - 1);
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const nextKey = React.useRef(2);
  const [form, setForm] = React.useState<FormState>(() => ({
    description: "",
    costCenterId: "",
    materialGroup: "",
    items: [emptyItem(1)],
    justification: "",
    notSplit: false,
  }));
  const [errors, setErrors] = React.useState<Errors>({});
  const [reviewTab, setReviewTab] = React.useState<"summary" | "justification">("summary");
  const [submitting, setSubmitting] = React.useState(false);

  const fieldId = (name: string) => `${prefix}-${name}`;
  const fieldClass = `${prefix}-field`;
  const controlClass = (base: string, extra?: string) => cn(base, `${prefix}-input`, extra);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    const changed: keyof FormState = key;
    if (changed === "description" || changed === "costCenterId" || changed === "materialGroup" || changed === "justification") {
      setErrors((current) => (current[changed] ? { ...current, [changed]: undefined } : current));
    }
  }

  function updateItem(index: number, key: ItemErrorKey, value: string) {
    setForm((current) => ({
      ...current,
      items: current.items.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry)),
    }));
    setErrors((current) => {
      const rowErrors = current.items?.[index];
      if (!rowErrors || !rowErrors[key]) return current;
      const nextRow = { ...rowErrors };
      delete nextRow[key];
      const nextItems = { ...current.items };
      if (Object.keys(nextRow).length) nextItems[index] = nextRow;
      else delete nextItems[index];
      return { ...current, items: nextItems };
    });
  }

  function addItem() {
    setForm((current) => ({ ...current, items: [...current.items, emptyItem(nextKey.current++)] }));
  }

  function removeItem(index: number) {
    setForm((current) => (current.items.length === 1 ? current : { ...current, items: current.items.filter((_, i) => i !== index) }));
    setErrors((current) => (current.items ? { ...current, items: {} } : current));
  }

  function focusId(id: string) {
    window.setTimeout(() => {
      document.getElementById(id)?.focus();
    }, 0);
  }

  // ─────────── Validation ───────────

  function validateGeneral(): Errors {
    const next: Errors = {};
    if (!form.description.trim()) next.description = "Enter a description";
    if (!form.costCenterId) next.costCenterId = `Select a ${labels.costCenter.toLowerCase()}`;
    if (!form.materialGroup) next.materialGroup = "Select a material group";
    return next;
  }

  function validateItems(): Errors {
    const items: Record<number, ItemErrors> = {};
    form.items.forEach((entry, index) => {
      const row: ItemErrors = {};
      if (!entry.description.trim()) row.description = "Enter an item description";
      const quantity = Number(entry.quantity);
      if (!entry.quantity.trim()) row.quantity = "Enter a quantity";
      else if (!Number.isFinite(quantity) || quantity <= 0) row.quantity = "Enter a quantity greater than 0";
      const unitPrice = Number(entry.unitPrice);
      if (!entry.unitPrice.trim()) row.unitPrice = "Enter a unit price";
      else if (!Number.isFinite(unitPrice) || unitPrice <= 0) row.unitPrice = "Enter a unit price greater than 0";
      if (!entry.deliveryDate) row.deliveryDate = "Select a requested delivery date";
      else {
        const days = daysFromToday(entry.deliveryDate);
        if (!Number.isFinite(days)) row.deliveryDate = "Enter the date as YYYY-MM-DD";
        else if (days < MIN_DELIVERY_DAYS) row.deliveryDate = `Delivery date must be at least ${MIN_DELIVERY_DAYS} days from today`;
      }
      if (Object.keys(row).length) items[index] = row;
    });
    return Object.keys(items).length ? { items } : {};
  }

  function validateJustification(): Errors {
    return countSentences(form.justification) < 2 ? { justification: "Write at least two sentences" } : {};
  }

  function firstItemErrorId(items: Record<number, ItemErrors>): string | undefined {
    const index = Number(Object.keys(items)[0]);
    const row = items[index];
    const key = (Object.keys(row) as ItemErrorKey[])[0];
    return key ? fieldId(`item-${index + 1}-${ITEM_FIELD_NAMES[key]}`) : undefined;
  }

  function firstErrorId(next: Errors): string | undefined {
    if (next.description) return fieldId("description");
    if (next.costCenterId) return fieldId("cost-center");
    if (next.materialGroup) return fieldId("material-group");
    if (next.items) return firstItemErrorId(next.items);
    if (next.justification) return fieldId("justification");
    return undefined;
  }

  function stepFor(next: Errors): StepKey {
    if (next.description || next.costCenterId || next.materialGroup) return "general";
    if (next.items) return "items";
    return version === "v2" ? "review" : "justification";
  }

  function validateStep(key: StepKey): Errors {
    if (key === "general") return validateGeneral();
    if (key === "items") return validateItems();
    if (key === "justification") return validateJustification();
    return {};
  }

  function goNext() {
    const next = validateStep(step.key);
    setErrors(next);
    if (hasErrors(next)) {
      const id = firstErrorId(next);
      if (id) focusId(id);
      return;
    }
    setStepIndex(stepIndex + 1);
  }

  function goBack() {
    setErrors({});
    setStepIndex(Math.max(0, stepIndex - 1));
  }

  function submit() {
    if (submitting) return;
    const next: Errors = { ...validateGeneral(), ...validateItems(), ...validateJustification() };
    if (hasErrors(next)) {
      setErrors(next);
      const target = stepFor(next);
      const index = steps.findIndex((entry) => entry.key === target);
      if (index >= 0) setStepIndex(index);
      if (target === "review") setReviewTab("justification");
      const id = firstErrorId(next);
      if (id) focusId(id);
      return;
    }
    setSubmitting(true);
    const created = createRequisition({
      description: form.description.trim(),
      costCenterId: form.costCenterId,
      materialGroup: form.materialGroup,
      items: form.items.map((entry) => ({
        description: entry.description.trim(),
        quantity: Number(entry.quantity),
        unitPrice: Number(entry.unitPrice),
        deliveryDate: entry.deliveryDate,
      })),
      justification: form.justification.trim(),
      notSplit: form.notSplit,
    });
    router.push(`/sandbox/erp/requisitions/${created.id}?created=1`);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLast) submit();
    else goNext();
  }

  // ─────────── Derived values ───────────

  const total = form.items.reduce((sum, entry) => sum + (Number(entry.quantity) || 0) * (Number(entry.unitPrice) || 0), 0);
  const costCenter = db.costCenters.find((entry) => entry.id === form.costCenterId);
  const reviewRows = [
    { label: labels.description, value: form.description.trim() },
    { label: labels.costCenter, value: costCenterLabel(costCenter) },
    { label: labels.materialGroup, value: form.materialGroup },
    {
      label: "Items",
      value: form.items.map((entry) =>
        itemLine({ description: entry.description.trim(), quantity: Number(entry.quantity) || 0, unitPrice: Number(entry.unitPrice) || 0, deliveryDate: entry.deliveryDate }),
      ),
    },
    { label: "Total value", value: formatCurrency(total) },
    { label: labels.justification, value: form.justification.trim() },
  ];

  // ─────────── Field groups ───────────

  const generalFields = (
    <div className={s.formGrid}>
      <Field id={fieldId("description")} label={labels.description} required error={errors.description} className={fieldClass}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            type="text"
            name="description"
            required
            className={controlClass(inputClass)}
            value={form.description}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => update("description", event.target.value)}
          />
        )}
      </Field>
      <div className={cn(s.formGrid, s.formGrid2)}>
        <Field id={fieldId("cost-center")} label={labels.costCenter} required error={errors.costCenterId} className={fieldClass}>
          {({ id, describedBy, invalid }) => (
            <select
              id={id}
              name="costCenterId"
              required
              className={controlClass(selectClass)}
              value={form.costCenterId}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              onChange={(event) => update("costCenterId", event.target.value)}
            >
              <option value="">Select a {labels.costCenter.toLowerCase()}</option>
              {db.costCenters.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {costCenterLabel(entry)}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id={fieldId("material-group")} label={labels.materialGroup} required error={errors.materialGroup} className={fieldClass}>
          {({ id, describedBy, invalid }) => (
            <select
              id={id}
              name="materialGroup"
              required
              className={controlClass(selectClass)}
              value={form.materialGroup}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              onChange={(event) => update("materialGroup", event.target.value as MaterialGroup | "")}
            >
              <option value="">Select a material group</option>
              {MATERIAL_GROUPS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
    </div>
  );

  const itemFields = (
    <div className="min-w-0">
      <div className={s.tableWrap}>
        <table className={cn(s.table, s.itemTable)}>
          <caption className={s.srOnly}>Requisition items</caption>
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col">{labels.itemDescription}</th>
              <th scope="col">{labels.quantity}</th>
              <th scope="col">{labels.unitPrice}</th>
              <th scope="col">{labels.deliveryDate}</th>
              {version === "v2" ? (
                <th scope="col" className={s.tdRight}>
                  Line total
                </th>
              ) : null}
              <th scope="col">
                <span className={s.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {form.items.map((entry, index) => {
              const line = index + 1;
              const suffix = index === 0 ? "" : ` (line ${line})`;
              const rowErrors = errors.items?.[index] ?? {};
              const lineTotal = (Number(entry.quantity) || 0) * (Number(entry.unitPrice) || 0);
              return (
                <tr key={entry.key}>
                  <td className={s.num}>{line}</td>
                  <td>
                    <Field id={fieldId(`item-${line}-description`)} label={`${labels.itemDescription}${suffix}`} hideLabel error={rowErrors.description} className={fieldClass}>
                      {({ id, describedBy, invalid }) => (
                        <input
                          id={id}
                          type="text"
                          name={`items.${index}.description`}
                          className={controlClass(inputClass)}
                          value={entry.description}
                          aria-invalid={invalid || undefined}
                          aria-describedby={describedBy}
                          onChange={(event) => updateItem(index, "description", event.target.value)}
                        />
                      )}
                    </Field>
                  </td>
                  <td>
                    <Field id={fieldId(`item-${line}-quantity`)} label={`${labels.quantity}${suffix}`} hideLabel error={rowErrors.quantity} className={fieldClass}>
                      {({ id, describedBy, invalid }) => (
                        <input
                          id={id}
                          type="number"
                          name={`items.${index}.quantity`}
                          min={1}
                          step={1}
                          inputMode="numeric"
                          className={controlClass(inputClass, s.controlNarrow)}
                          value={entry.quantity}
                          aria-invalid={invalid || undefined}
                          aria-describedby={describedBy}
                          onChange={(event) => updateItem(index, "quantity", event.target.value)}
                        />
                      )}
                    </Field>
                  </td>
                  <td>
                    <Field id={fieldId(`item-${line}-unit-price`)} label={`${labels.unitPrice}${suffix}`} hideLabel error={rowErrors.unitPrice} className={fieldClass}>
                      {({ id, describedBy, invalid }) => (
                        <input
                          id={id}
                          type="number"
                          name={`items.${index}.unitPrice`}
                          min={0}
                          step={0.01}
                          inputMode="decimal"
                          className={controlClass(inputClass, s.controlNarrow)}
                          value={entry.unitPrice}
                          aria-invalid={invalid || undefined}
                          aria-describedby={describedBy}
                          onChange={(event) => updateItem(index, "unitPrice", event.target.value)}
                        />
                      )}
                    </Field>
                  </td>
                  <td>
                    <Field id={fieldId(`item-${line}-delivery-date`)} label={`${labels.deliveryDate}${suffix}`} hideLabel error={rowErrors.deliveryDate} className={fieldClass}>
                      {({ id, describedBy, invalid }) => (
                        <input
                          id={id}
                          type="date"
                          name={`items.${index}.deliveryDate`}
                          className={controlClass(inputClass)}
                          value={entry.deliveryDate}
                          aria-invalid={invalid || undefined}
                          aria-describedby={describedBy}
                          onChange={(event) => updateItem(index, "deliveryDate", event.target.value)}
                        />
                      )}
                    </Field>
                  </td>
                  {version === "v2" ? <td className={cn(s.tdRight, "pt-[15px]")}>{formatCurrency(lineTotal)}</td> : null}
                  <td>
                    <button
                      type="button"
                      className={s.btnIcon}
                      aria-label={`Remove line ${line}`}
                      title={`Remove line ${line}`}
                      disabled={form.items.length === 1}
                      onClick={() => removeItem(index)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Button type="button" onClick={addItem}>
          {labels.addItem}
        </Button>
        <span className={cn(s.num, "text-[13px]")}>
          <span className={s.muted}>Total value </span>
          <strong>{formatCurrency(total)}</strong>
        </span>
      </div>
      <p className={cn(s.help, "mt-3")}>Requested delivery dates must be at least {MIN_DELIVERY_DAYS} days from today.</p>
    </div>
  );

  const justificationField = (
    <Field
      id={fieldId("justification")}
      label={labels.justification}
      required
      help="Explain the need and how the quantity was determined."
      error={errors.justification}
      className={fieldClass}
    >
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          name="justification"
          required
          rows={5}
          className={controlClass(textareaClass)}
          value={form.justification}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => update("justification", event.target.value)}
        />
      )}
    </Field>
  );

  const notSplitField = (
    <div className={fieldClass}>
      <label htmlFor={fieldId("not-split")} className={s.check}>
        <input
          id={fieldId("not-split")}
          type="checkbox"
          name="notSplit"
          className={`${prefix}-checkbox`}
          checked={form.notSplit}
          onChange={(event) => update("notSplit", event.target.checked)}
        />
        <span>{labels.notSplit}</span>
      </label>
    </div>
  );

  const stepHeadingId = `${prefix}-wizard-step`;

  return (
    <form onSubmit={onSubmit} noValidate className={cn(s.card, "mx-auto max-w-[920px]")} aria-labelledby={stepHeadingId}>
      <div className={cn(s.cardHeader, "flex-col items-stretch gap-2 sm:flex-row sm:items-center")}>
        <p id={stepHeadingId} className="m-0 text-[13px] font-semibold" aria-live="polite">
          Step {stepIndex + 1} of {steps.length} · {step.title}
        </p>
        <ol className={cn(s.stepper, "m-0 list-none p-0 sm:w-64")} aria-hidden="true">
          {steps.map((entry, index) => (
            <React.Fragment key={entry.key}>
              {index > 0 ? <li className={s.stepLine} /> : null}
              <li className={index === stepIndex ? s.stepDotActive : index < stepIndex ? s.stepDotDone : s.stepDot} title={entry.title}>
                {index + 1}
              </li>
            </React.Fragment>
          ))}
        </ol>
      </div>

      <div className={s.cardBody}>
        {step.key === "general" ? (
          <section aria-labelledby={`${prefix}-step-general-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-general-heading`} className={s.h2}>
              {labels.generalStep}
            </h2>
            {generalFields}
          </section>
        ) : null}

        {step.key === "items" ? (
          <section aria-labelledby={`${prefix}-step-items-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-items-heading`} className={s.h2}>
              {labels.itemsStep}
            </h2>
            {itemFields}
          </section>
        ) : null}

        {step.key === "justification" ? (
          <section aria-labelledby={`${prefix}-step-justification-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-justification-heading`} className={s.h2}>
              {labels.justificationStep}
            </h2>
            {justificationField}
          </section>
        ) : null}

        {step.key === "review" ? (
          <section aria-labelledby={`${prefix}-step-review-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-review-heading`} className={s.h2}>
              {labels.reviewStep}
            </h2>
            {version === "v1" ? (
              <>
                <p className={cn(s.muted, "m-0")}>Check the details below before submitting. Use Previous to change any value.</p>
                <DefinitionList rows={reviewRows} />
                {notSplitField}
              </>
            ) : (
              <Tabs.Root value={reviewTab} onValueChange={(value) => setReviewTab(value === "justification" ? "justification" : "summary")}>
                <Tabs.List className={s.tabList} aria-label="Review sections">
                  <Tabs.Trigger value="summary" className={s.tab}>
                    {labels.summaryTab}
                  </Tabs.Trigger>
                  <Tabs.Trigger value="justification" className={s.tab}>
                    {labels.justificationTab}
                  </Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="summary" className={cn(s.tabPanel, "grid gap-4 px-0")}>
                  <p className={cn(s.muted, "m-0")}>Check the details below before ordering. Use Back to change any value.</p>
                  <DefinitionList rows={reviewRows} />
                  {notSplitField}
                </Tabs.Content>
                <Tabs.Content value="justification" className={cn(s.tabPanel, "grid gap-4 px-0")}>
                  {justificationField}
                </Tabs.Content>
              </Tabs.Root>
            )}
          </section>
        ) : null}
      </div>

      <ActionBar
        start={
          stepIndex === 0 ? (
            <Link href="/sandbox/erp" className={s.btnGhost}>
              Cancel
            </Link>
          ) : (
            <Button type="button" onClick={goBack}>
              {labels.back}
            </Button>
          )
        }
      >
        {isLast ? (
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? "Submitting…" : labels.submit}
          </Button>
        ) : (
          <Button type="submit" variant="primary">
            {labels.next}
          </Button>
        )}
      </ActionBar>
    </form>
  );
}
