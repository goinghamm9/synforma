"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tabs } from "radix-ui";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLUMN_TYPES, createTable, isSnakeCase, type Column, type ColumnType, type NimbusDb } from "../_lib/db";
import { projectPath, useUi } from "../_lib/ui-version";
import { DEFAULT_POLICY, PolicyFields, validatePolicy, type PolicyDraft, type PolicyErrors } from "./policy-fields";
import { Button, Code, DefinitionList, Field, Toggle, inputMonoClass, selectClass, textareaClass } from "./ui";
import s from "../data.module.css";

interface ColumnDraft {
  key: number;
  name: string;
  type: ColumnType;
  nullable: boolean;
  primaryKey: boolean;
}

interface FormState {
  name: string;
  description: string;
  columns: ColumnDraft[];
  rls: boolean;
  policy: PolicyDraft;
  acknowledged: boolean;
}

interface Errors {
  name?: string;
  columns?: Record<number, string>;
  policy?: PolicyErrors;
  acknowledged?: string;
}

const STEP_TITLES = ["Name and description", "Columns", "Security", "Review"] as const;
type StepNumber = 1 | 2 | 3 | 4;

export const SNAKE_CASE_MESSAGE = "Use snake_case: lowercase letters, digits and underscores";

export function TableWizard({ db, projectId }: { db: NimbusDb; projectId: string }) {
  const router = useRouter();
  const { version, labels, prefix } = useUi();
  const listHref = projectPath(projectId, "/tables");

  const [step, setStep] = React.useState<StepNumber>(1);
  const [form, setForm] = React.useState<FormState>(() => ({
    name: "",
    description: "",
    columns: [{ key: 1, name: "id", type: "uuid", nullable: false, primaryKey: true }],
    rls: false,
    policy: { ...DEFAULT_POLICY },
    acknowledged: false,
  }));
  const [errors, setErrors] = React.useState<Errors>({});
  const [reviewTab, setReviewTab] = React.useState<"summary" | "policies">("summary");
  const [submitting, setSubmitting] = React.useState(false);
  const nextKey = React.useRef(2);

  const fieldId = (name: string) => `${prefix}-${name}`;
  const fieldClass = `${prefix}-field`;
  const controlClass = `${prefix}-input`;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateColumn(key: number, patch: Partial<ColumnDraft>) {
    setForm((current) => ({ ...current, columns: current.columns.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));
    setErrors((current) => {
      if (!current.columns?.[key]) return current;
      const columns = { ...current.columns };
      delete columns[key];
      return { ...current, columns };
    });
  }

  function addColumn() {
    const key = nextKey.current;
    nextKey.current += 1;
    setForm((current) => ({ ...current, columns: [...current.columns, { key, name: "", type: "text", nullable: true, primaryKey: false }] }));
    window.setTimeout(() => document.getElementById(fieldId(`col-${key}-name`))?.focus(), 0);
  }

  function removeColumn(key: number) {
    setForm((current) => (current.columns.length <= 1 ? current : { ...current, columns: current.columns.filter((c) => c.key !== key) }));
  }

  function focus(id: string) {
    window.setTimeout(() => document.getElementById(id)?.focus(), 0);
  }

  function validateName(): Errors {
    const next: Errors = {};
    const name = form.name.trim();
    if (!name) next.name = "Enter a table name";
    else if (!isSnakeCase(name)) next.name = SNAKE_CASE_MESSAGE;
    else if (db.tables.some((t) => t.projectId === projectId && t.name === name)) next.name = `A table named ${name} already exists in this project`;
    return next;
  }

  function validateColumns(): Errors {
    const columns: Record<number, string> = {};
    const seen = new Set<string>();
    for (const column of form.columns) {
      const name = column.name.trim();
      if (!name) columns[column.key] = "Enter a column name";
      else if (!isSnakeCase(name)) columns[column.key] = SNAKE_CASE_MESSAGE;
      else if (seen.has(name)) columns[column.key] = `Duplicate column name ${name}`;
      seen.add(name);
    }
    return Object.keys(columns).length ? { columns } : {};
  }

  function validatePolicyStep(): Errors {
    if (!form.rls) return {};
    const policy = validatePolicy(form.policy, false);
    return Object.keys(policy).length ? { policy } : {};
  }

  function goNext() {
    if (step === 1) {
      const next = validateName();
      setErrors(next);
      if (next.name) return focus(fieldId("table-name"));
      setStep(2);
      return;
    }
    if (step === 2) {
      const next = validateColumns();
      setErrors(next);
      const firstKey = next.columns ? Number(Object.keys(next.columns)[0]) : undefined;
      if (firstKey !== undefined) return focus(fieldId(`col-${firstKey}-name`));
      setStep(3);
      return;
    }
    if (step === 3) {
      // In v1 the policy is defined on this step; in v2 it lives on the review step's Policies tab.
      const next = version === "v1" ? validatePolicyStep() : {};
      setErrors(next);
      if (next.policy?.using) return focus(fieldId("policy-using"));
      setReviewTab("summary");
      setStep(4);
    }
  }

  function goBack() {
    setErrors({});
    setStep((current) => (current > 1 ? ((current - 1) as StepNumber) : current));
  }

  function create() {
    if (submitting) return;
    const policyErrors = validatePolicyStep();
    if (policyErrors.policy) {
      setErrors(policyErrors);
      if (version === "v2") setReviewTab("policies");
      focus(fieldId("policy-using"));
      return;
    }
    if (!form.acknowledged) {
      setErrors({ acknowledged: "Confirm the acknowledgement to continue" });
      if (version === "v2") setReviewTab("summary");
      focus(fieldId("ack"));
      return;
    }
    setSubmitting(true);
    const columns: Column[] = form.columns.map((c) => ({
      name: c.name.trim(),
      type: c.type,
      nullable: c.nullable,
      primaryKey: c.primaryKey,
      defaultValue: c.name.trim() === "id" && c.type === "uuid" ? "gen_random_uuid()" : "",
    }));
    const policyName = form.policy.name.trim();
    const created = createTable({
      projectId,
      name: form.name.trim(),
      description: form.description.trim(),
      columns,
      rlsEnabled: form.rls,
      policies:
        form.rls && policyName ? [{ name: policyName, role: form.policy.role, command: form.policy.command, using: form.policy.using.trim() }] : [],
    });
    router.push(`${projectPath(projectId, `/tables/${created.id}`)}?created=1`);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 4) create();
    else goNext();
  }

  const primaryKey = form.columns
    .filter((c) => c.primaryKey && c.name.trim())
    .map((c) => c.name.trim())
    .join(", ");
  const policyName = form.policy.name.trim();
  const policySummary = form.rls && policyName ? `${policyName} · ${form.policy.role} · ${form.policy.command}` : "None";

  const reviewRows = [
    { label: "Table name", value: form.name.trim() ? <Code>{form.name.trim()}</Code> : "" },
    { label: "Description", value: form.description.trim() },
    {
      label: "Columns",
      value: `${form.columns.length} ${form.columns.length === 1 ? "column" : "columns"}: ${form.columns.map((c) => `${c.name.trim() || "(unnamed)"} ${c.type}`).join(", ")}`,
    },
    { label: "Primary key", value: primaryKey || "None" },
    { label: labels.rls, value: form.rls ? "Enabled" : "Disabled" },
    { label: "Policies", value: policySummary },
  ];

  // ─────────── Pieces ───────────

  const policyFields = (
    <PolicyFields
      idPrefix={prefix}
      value={form.policy}
      onChange={(policy) => {
        update("policy", policy);
        if (errors.policy) setErrors((current) => ({ ...current, policy: undefined }));
      }}
      errors={errors.policy}
      fieldClass={fieldClass}
      controlClass={controlClass}
    />
  );

  const policySection = form.rls ? (
    <fieldset className={cn(s.fieldset, fieldClass, "grid gap-4")}>
      <legend className={s.legend}>Initial policy</legend>
      <p className={cn(s.muted, "m-0 text-[13px]")}>
        Optional. With {labels.rls.toLowerCase()} on and no policy, no rows are readable through the API. Leave the policy name empty to
        add policies later.
      </p>
      {policyFields}
    </fieldset>
  ) : (
    <div role="note" className={s.bannerWarning}>
      <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{labels.rls} is off. Any client holding the anon key can read and write every row of this table.</span>
    </div>
  );

  const acknowledgement = (
    <div className={fieldClass}>
      <label htmlFor={fieldId("ack")} className={s.check}>
        <input
          id={fieldId("ack")}
          type="checkbox"
          name="acknowledged"
          className={`${prefix}-checkbox`}
          checked={form.acknowledged}
          aria-invalid={errors.acknowledged ? true : undefined}
          aria-describedby={errors.acknowledged ? fieldId("ack-error") : undefined}
          onChange={(event) => {
            update("acknowledged", event.target.checked);
            if (errors.acknowledged) setErrors((current) => ({ ...current, acknowledged: undefined }));
          }}
        />
        I understand new tables must keep row level security on
      </label>
      {errors.acknowledged ? (
        <p id={fieldId("ack-error")} role="alert" className={s.error}>
          {errors.acknowledged}
        </p>
      ) : null}
    </div>
  );

  const summary = (
    <div className="grid gap-4">
      <p className={cn(s.muted, "m-0")}>Check the details below before saving. You can go back to change any value.</p>
      <DefinitionList rows={reviewRows} />
      {form.rls && !policyName ? (
        <div role="note" className={s.bannerWarning}>
          <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>No policy defined. Rows will not be readable through the API until a policy is added.</span>
        </div>
      ) : null}
      {acknowledgement}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className={cn(s.card, "mx-auto max-w-[860px]")}>
      <div className={s.wizardHeader}>
        <p className="m-0 text-[13px] font-semibold" aria-live="polite">
          Step {step} of 4 · {STEP_TITLES[step - 1]}
        </p>
        <ol className={cn(s.stepper, "m-0 list-none p-0")} aria-hidden="true">
          {STEP_TITLES.map((title, index) => {
            const n = index + 1;
            return (
              <React.Fragment key={title}>
                {index > 0 ? <li className={s.stepLine} /> : null}
                <li className={n === step ? s.stepDotActive : n < step ? s.stepDotDone : s.stepDot} title={title}>
                  {n}
                </li>
              </React.Fragment>
            );
          })}
        </ol>
      </div>

      <div className={s.cardBody}>
        {step === 1 ? (
          <section aria-labelledby={`${prefix}-step-1-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-1-heading`} className={s.h2}>
              Name and description
            </h2>
            <Field
              id={fieldId("table-name")}
              label="Table name"
              required
              help="Created in schema public. Lowercase letters, digits and underscores."
              error={errors.name}
              className={fieldClass}
            >
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  type="text"
                  name="tableName"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(inputMonoClass, controlClass)}
                  value={form.name}
                  aria-invalid={invalid || undefined}
                  aria-describedby={describedBy}
                  onChange={(event) => {
                    update("name", event.target.value);
                    if (errors.name) setErrors((current) => ({ ...current, name: undefined }));
                  }}
                />
              )}
            </Field>
            <Field id={fieldId("description")} label="Description" help="Shown in the table list and stored as a table comment." className={fieldClass}>
              {({ id, describedBy }) => (
                <textarea
                  id={id}
                  name="description"
                  rows={3}
                  className={cn(textareaClass, controlClass)}
                  value={form.description}
                  aria-describedby={describedBy}
                  onChange={(event) => update("description", event.target.value)}
                />
              )}
            </Field>
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-labelledby={`${prefix}-step-2-heading`} className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id={`${prefix}-step-2-heading`} className={s.h2}>
                Columns
              </h2>
              <Button type="button" size="sm" onClick={addColumn}>
                <Plus size={14} aria-hidden="true" />
                Add column
              </Button>
            </div>
            <div className="grid gap-3">
              {form.columns.map((column, index) => {
                const error = errors.columns?.[column.key];
                return (
                  <fieldset key={column.key} className={cn(s.columnRow, fieldClass)}>
                    <legend className={s.legend}>Column {index + 1}</legend>
                    <Field id={fieldId(`col-${column.key}-name`)} label="Column name" required error={error}>
                      {({ id, describedBy, invalid }) => (
                        <input
                          id={id}
                          type="text"
                          name={`column-${column.key}-name`}
                          autoComplete="off"
                          spellCheck={false}
                          className={cn(inputMonoClass, controlClass)}
                          value={column.name}
                          aria-invalid={invalid || undefined}
                          aria-describedby={describedBy}
                          onChange={(event) => updateColumn(column.key, { name: event.target.value })}
                        />
                      )}
                    </Field>
                    <Field id={fieldId(`col-${column.key}-type`)} label="Type">
                      {({ id }) => (
                        <select
                          id={id}
                          name={`column-${column.key}-type`}
                          className={cn(selectClass, controlClass)}
                          value={column.type}
                          onChange={(event) => updateColumn(column.key, { type: event.target.value as ColumnType })}
                        >
                          {COLUMN_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      )}
                    </Field>
                    <label htmlFor={fieldId(`col-${column.key}-nullable`)} className={s.checkCell}>
                      <input
                        id={fieldId(`col-${column.key}-nullable`)}
                        type="checkbox"
                        name={`column-${column.key}-nullable`}
                        className={`${prefix}-checkbox`}
                        checked={column.nullable}
                        onChange={(event) => updateColumn(column.key, { nullable: event.target.checked })}
                      />
                      Nullable
                    </label>
                    <label htmlFor={fieldId(`col-${column.key}-pk`)} className={s.checkCell}>
                      <input
                        id={fieldId(`col-${column.key}-pk`)}
                        type="checkbox"
                        name={`column-${column.key}-pk`}
                        className={`${prefix}-checkbox`}
                        checked={column.primaryKey}
                        onChange={(event) => updateColumn(column.key, { primaryKey: event.target.checked, ...(event.target.checked ? { nullable: false } : {}) })}
                      />
                      Primary key
                    </label>
                    <button
                      type="button"
                      className={cn(s.btnIcon, "sm:mb-0.5")}
                      aria-label={`Remove column ${index + 1}`}
                      title={`Remove column ${index + 1}`}
                      disabled={form.columns.length <= 1}
                      onClick={() => removeColumn(column.key)}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </fieldset>
                );
              })}
            </div>
            {!form.columns.some((c) => c.primaryKey) ? (
              <div role="note" className={s.bannerInfo}>
                <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                <span>No primary key selected. Rows of a table without a primary key cannot be edited in the table editor.</span>
              </div>
            ) : null}
          </section>
        ) : null}

        {step === 3 ? (
          <section aria-labelledby={`${prefix}-step-3-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-3-heading`} className={s.h2}>
              {labels.securityStep}
            </h2>
            <Toggle
              id={fieldId("rls")}
              label={labels.rls}
              help="Restrict access to rows with policies. Recommended for every table exposed through the API."
              checked={form.rls}
              onCheckedChange={(checked) => {
                update("rls", checked);
                if (errors.policy) setErrors((current) => ({ ...current, policy: undefined }));
              }}
              className={fieldClass}
            />
            {version === "v1" ? (
              policySection
            ) : form.rls ? (
              <div role="note" className={s.bannerInfo}>
                <span>Policies for this table are defined on the Review step under the {labels.policiesTab} tab.</span>
              </div>
            ) : (
              policySection
            )}
          </section>
        ) : null}

        {step === 4 ? (
          <section aria-labelledby={`${prefix}-step-4-heading`} className="grid gap-4">
            <h2 id={`${prefix}-step-4-heading`} className={s.h2}>
              Review
            </h2>
            {version === "v1" ? (
              summary
            ) : (
              <Tabs.Root value={reviewTab} onValueChange={(value) => setReviewTab(value === "policies" ? "policies" : "summary")}>
                <Tabs.List className={s.tabList} aria-label="Review sections">
                  <Tabs.Trigger value="summary" className={s.tab}>
                    {labels.summaryTab}
                  </Tabs.Trigger>
                  <Tabs.Trigger value="policies" className={s.tab}>
                    {labels.policiesTab}
                  </Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="summary" className={s.tabPanel}>
                  {summary}
                </Tabs.Content>
                <Tabs.Content value="policies" className={s.tabPanel}>
                  {form.rls ? (
                    <div className="grid gap-4">
                      <p className={cn(s.muted, "m-0 text-[13px]")}>
                        Optional. With {labels.rls.toLowerCase()} on and no policy, no rows are readable through the API.
                      </p>
                      {policyFields}
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      <div role="note" className={s.bannerWarning}>
                        <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
                        <span>{labels.rls} is off, so no policy applies. Turn it on in the {labels.securityStep} step to define a policy.</span>
                      </div>
                      <div>
                        <Button type="button" onClick={() => setStep(3)}>
                          Go to {labels.securityStep}
                        </Button>
                      </div>
                    </div>
                  )}
                </Tabs.Content>
              </Tabs.Root>
            )}
          </section>
        ) : null}
      </div>

      <div className={s.wizardFooter}>
        <div>
          {step === 1 ? (
            <Link href={listHref} className={s.btnSecondary}>
              Cancel
            </Link>
          ) : (
            <Button type="button" onClick={goBack}>
              {labels.back}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {step < 4 ? (
            <Button type="submit" variant="primary">
              {labels.next}
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving…" : labels.createTable}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
