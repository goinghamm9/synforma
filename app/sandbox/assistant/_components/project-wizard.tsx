"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tabs } from "radix-ui";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CUSTOM_TEMPLATE,
  DEFAULT_RETENTION,
  INSTRUCTION_TEMPLATES,
  MODELS,
  RETENTION_OPTIONS,
  REVIEWERS,
  VISIBILITY_OPTIONS,
  createProject,
  isApprovedTemplate,
  isValidProjectName,
  projectNameExists,
  templateByName,
  type LumenDb,
  type ModelName,
  type RetentionOption,
  type Visibility,
} from "../_lib/db";
import { BASE_PATH, projectPath, useUi } from "../_lib/ui-version";
import {
  Button,
  DefinitionList,
  Field,
  Toggle,
  inputClass,
  selectClass,
  textareaClass,
} from "./ui";
import s from "../assistant.module.css";

interface FormState {
  name: string;
  purpose: string;
  model: ModelName;
  template: string;
  instructions: string;
  source: string;
  restrict: boolean;
  retention: RetentionOption;
  reviewer: string;
  visibility: Visibility;
  acknowledged: boolean;
}

interface Errors {
  name?: string;
  template?: string;
  instructions?: string;
  source?: string;
  reviewer?: string;
  acknowledged?: string;
}

type StepNumber = 1 | 2 | 3 | 4;

export const NAME_FORMAT_MESSAGE =
  "Use letters, digits, spaces and hyphens only";

export function ProjectWizard({ db }: { db: LumenDb }) {
  const router = useRouter();
  const { version, labels, prefix } = useUi();
  const listHref = `${BASE_PATH}/projects`;
  const stepTitles = [
    "Basics",
    "Instructions",
    labels.knowledgeStep,
    "Review",
  ] as const;

  const [step, setStep] = React.useState<StepNumber>(1);
  const [form, setForm] = React.useState<FormState>(() => ({
    name: "",
    purpose: "",
    model: MODELS[0],
    template: "",
    instructions: "",
    source: "",
    restrict: true,
    retention: DEFAULT_RETENTION,
    reviewer: "",
    visibility: VISIBILITY_OPTIONS[0],
    acknowledged: false,
  }));
  const [errors, setErrors] = React.useState<Errors>({});
  const [reviewTab, setReviewTab] = React.useState<"summary" | "governance">(
    "summary",
  );
  const [submitting, setSubmitting] = React.useState(false);

  const fieldId = (name: string) => `${prefix}-${name}`;
  const fieldClass = `${prefix}-field`;
  const controlClass = `${prefix}-input`;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    const changed: keyof FormState = key;
    if (
      changed === "name" ||
      changed === "template" ||
      changed === "instructions" ||
      changed === "source" ||
      changed === "reviewer" ||
      changed === "acknowledged"
    ) {
      setErrors((current) =>
        current[changed] ? { ...current, [changed]: undefined } : current,
      );
    }
  }

  function chooseTemplate(name: string) {
    const template = templateByName(name);
    setForm((current) => ({
      ...current,
      template: name,
      instructions: template && isApprovedTemplate(name) ? template.text : "",
    }));
    setErrors((current) =>
      current.template || current.instructions
        ? { ...current, template: undefined, instructions: undefined }
        : current,
    );
  }

  function focus(id: string) {
    window.setTimeout(() => document.getElementById(id)?.focus(), 0);
  }

  // ─────────── Validation ───────────

  function validateBasics(): Errors {
    const name = form.name.trim();
    if (!name) return { name: "Enter a project name" };
    if (!isValidProjectName(name)) return { name: NAME_FORMAT_MESSAGE };
    if (projectNameExists(db, name))
      return { name: `A project named ${name} already exists` };
    return {};
  }

  function validateInstructions(): Errors {
    if (!form.template) return { template: "Select an instruction template" };
    if (form.template === CUSTOM_TEMPLATE && !form.instructions.trim())
      return { instructions: "Enter the custom instructions" };
    return {};
  }

  function validateKnowledge(): Errors {
    return form.source
      ? {}
      : { source: `Select a ${labels.knowledgeSource.toLowerCase()}` };
  }

  function goNext() {
    if (step === 1) {
      const next = validateBasics();
      setErrors(next);
      if (next.name) return focus(fieldId("project-name"));
      setStep(2);
      return;
    }
    if (step === 2) {
      const next = validateInstructions();
      setErrors(next);
      if (next.template) return focus(fieldId("template"));
      if (next.instructions) return focus(fieldId("instructions"));
      setStep(3);
      return;
    }
    if (step === 3) {
      const next = validateKnowledge();
      setErrors(next);
      if (next.source) return focus(fieldId("knowledge-source"));
      setReviewTab("summary");
      setStep(4);
    }
  }

  function goBack() {
    setErrors({});
    setStep((current) =>
      current > 1 ? ((current - 1) as StepNumber) : current,
    );
  }

  function create() {
    if (submitting) return;
    if (!form.reviewer) {
      setErrors({ reviewer: "Select a reviewer" });
      if (version === "v2") setReviewTab("summary");
      focus(fieldId("reviewer"));
      return;
    }
    if (!form.acknowledged) {
      setErrors({ acknowledged: "Confirm the acknowledgement to continue" });
      if (version === "v2") setReviewTab("summary");
      focus(fieldId("ack"));
      return;
    }
    setSubmitting(true);
    const created = createProject({
      name: form.name.trim(),
      purpose: form.purpose.trim(),
      model: form.model,
      template: form.template,
      instructions: form.instructions.trim(),
      sources: [form.source],
      restrictToKnowledge: form.restrict,
      retention: form.retention,
      reviewer: form.reviewer,
      visibility: form.visibility,
    });
    router.push(`${projectPath(created.id)}?created=1`);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 4) create();
    else goNext();
  }

  // ─────────── Derived values ───────────

  const reviewRows = [
    { label: "Project name", value: form.name.trim() },
    { label: "Purpose", value: form.purpose.trim() },
    { label: "Model", value: form.model },
    { label: "Instruction template", value: form.template },
    { label: labels.knowledgeSource, value: form.source },
    { label: "Data retention", value: form.retention },
    { label: "Reviewer", value: form.reviewer },
    { label: "Visibility", value: form.visibility },
  ];

  // ─────────── Pieces ───────────

  const retentionGroup = (
    <div className="grid gap-3">
      <h3 className={s.h3}>Retention</h3>
      <Field
        id={fieldId("retention")}
        label="Data retention"
        help="How long conversations with this project are kept."
        className={fieldClass}
      >
        {({ id, describedBy }) => (
          <select
            id={id}
            name="retention"
            className={cn(selectClass, controlClass)}
            value={form.retention}
            aria-describedby={describedBy}
            onChange={(event) =>
              update("retention", event.target.value as RetentionOption)
            }
          >
            {RETENTION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}
      </Field>
    </div>
  );

  const reviewerField = (
    <Field
      id={fieldId("reviewer")}
      label="Reviewer"
      required
      help="Reviews the instructions before the project goes live."
      error={errors.reviewer}
      className={fieldClass}
    >
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          name="reviewer"
          required
          className={cn(selectClass, controlClass)}
          value={form.reviewer}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => update("reviewer", event.target.value)}
        >
          <option value="">Select a reviewer</option>
          {REVIEWERS.map((reviewer) => (
            <option key={reviewer} value={reviewer}>
              {reviewer}
            </option>
          ))}
        </select>
      )}
    </Field>
  );

  const visibilityField = (
    <fieldset className={cn(s.fieldset, fieldClass, "grid gap-1")}>
      <legend className={s.legend}>Visibility</legend>
      {VISIBILITY_OPTIONS.map((option, index) => (
        <label
          key={option}
          htmlFor={fieldId(`visibility-${index}`)}
          className={s.check}
        >
          <input
            id={fieldId(`visibility-${index}`)}
            type="radio"
            name="visibility"
            value={option}
            className={`${prefix}-radio`}
            checked={form.visibility === option}
            onChange={() => update("visibility", option)}
          />
          {option}
        </label>
      ))}
    </fieldset>
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
          aria-describedby={
            errors.acknowledged ? fieldId("ack-error") : undefined
          }
          onChange={(event) => update("acknowledged", event.target.checked)}
        />
        I confirm this project follows the AI use policy
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
      <p className={cn(s.muted, "m-0")}>
        Check the details below before creating the project. You can go back to
        change any value.
      </p>
      <DefinitionList rows={reviewRows} />
      {reviewerField}
      {visibilityField}
      {acknowledgement}
    </div>
  );

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={cn(s.card, "mx-auto max-w-[860px]")}
    >
      <div className={s.wizardHeader}>
        <p className="m-0 text-[13px] font-semibold" aria-live="polite">
          Step {step} of 4 · {stepTitles[step - 1]}
        </p>
        <ol className={cn(s.stepper, "m-0 list-none p-0")} aria-hidden="true">
          {stepTitles.map((title, index) => {
            const n = index + 1;
            return (
              <React.Fragment key={title}>
                {index > 0 ? <li className={s.stepLine} /> : null}
                <li
                  className={
                    n === step
                      ? s.stepDotActive
                      : n < step
                        ? s.stepDotDone
                        : s.stepDot
                  }
                  title={title}
                >
                  {n}
                </li>
              </React.Fragment>
            );
          })}
        </ol>
      </div>

      <div className={s.cardBody}>
        {step === 1 ? (
          <section
            aria-labelledby={`${prefix}-step-1-heading`}
            className="grid gap-4"
          >
            <h2 id={`${prefix}-step-1-heading`} className={s.h2}>
              Basics
            </h2>
            <Field
              id={fieldId("project-name")}
              label="Project name"
              required
              help="Letters, digits, spaces and hyphens."
              error={errors.name}
              className={fieldClass}
            >
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  type="text"
                  name="projectName"
                  required
                  autoComplete="off"
                  className={cn(inputClass, controlClass)}
                  value={form.name}
                  aria-invalid={invalid || undefined}
                  aria-describedby={describedBy}
                  onChange={(event) => update("name", event.target.value)}
                />
              )}
            </Field>
            <Field
              id={fieldId("purpose")}
              label="Purpose"
              help="One or two sentences on what this project is for."
              className={fieldClass}
            >
              {({ id, describedBy }) => (
                <textarea
                  id={id}
                  name="purpose"
                  rows={3}
                  className={cn(textareaClass, controlClass)}
                  value={form.purpose}
                  aria-describedby={describedBy}
                  onChange={(event) => update("purpose", event.target.value)}
                />
              )}
            </Field>
            <Field
              id={fieldId("model")}
              label="Model"
              help="Standard for everyday work, Pro for longer reasoning, Fast for high volume."
              className={fieldClass}
            >
              {({ id, describedBy }) => (
                <select
                  id={id}
                  name="model"
                  className={cn(selectClass, controlClass)}
                  value={form.model}
                  aria-describedby={describedBy}
                  onChange={(event) =>
                    update("model", event.target.value as ModelName)
                  }
                >
                  {MODELS.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </section>
        ) : null}

        {step === 2 ? (
          <section
            aria-labelledby={`${prefix}-step-2-heading`}
            className="grid gap-4"
          >
            <h2 id={`${prefix}-step-2-heading`} className={s.h2}>
              Instructions
            </h2>
            <Field
              id={fieldId("template")}
              label="Instruction template"
              required
              help="Approved templates are maintained by the AI governance team."
              error={errors.template}
              className={fieldClass}
            >
              {({ id, describedBy, invalid }) => (
                <select
                  id={id}
                  name="template"
                  required
                  className={cn(selectClass, controlClass)}
                  value={form.template}
                  aria-invalid={invalid || undefined}
                  aria-describedby={describedBy}
                  onChange={(event) => chooseTemplate(event.target.value)}
                >
                  <option value="">Select a template</option>
                  {INSTRUCTION_TEMPLATES.map((template) => (
                    <option key={template.name} value={template.name}>
                      {template.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            {form.template === CUSTOM_TEMPLATE ? (
              <div role="note" className={s.bannerWarning}>
                <AlertTriangle
                  size={16}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                />
                <span>
                  Custom instructions need a reviewer&apos;s approval before the
                  project can be used. It is created as &quot;Pending
                  review&quot;.
                </span>
              </div>
            ) : null}
            <Field
              id={fieldId("instructions")}
              label="Instructions"
              help="Edit the wording if needed."
              error={errors.instructions}
              className={fieldClass}
            >
              {({ id, describedBy, invalid }) => (
                <textarea
                  id={id}
                  name="instructions"
                  rows={6}
                  className={cn(textareaClass, controlClass)}
                  value={form.instructions}
                  aria-invalid={invalid || undefined}
                  aria-describedby={describedBy}
                  onChange={(event) =>
                    update("instructions", event.target.value)
                  }
                />
              )}
            </Field>
          </section>
        ) : null}

        {step === 3 ? (
          <section
            aria-labelledby={`${prefix}-step-3-heading`}
            className="grid gap-4"
          >
            <h2 id={`${prefix}-step-3-heading`} className={s.h2}>
              {labels.knowledgeStep}
            </h2>
            <div className="grid gap-3">
              <h3 className={s.h3}>Connected knowledge</h3>
              <Field
                id={fieldId("knowledge-source")}
                label={labels.knowledgeSource}
                required
                help="Connected knowledge the project answers from."
                error={errors.source}
                className={fieldClass}
              >
                {({ id, describedBy, invalid }) => (
                  <select
                    id={id}
                    name="source"
                    required
                    className={cn(selectClass, controlClass)}
                    value={form.source}
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => update("source", event.target.value)}
                  >
                    <option value="">Select a source</option>
                    {db.sources.map((source) => (
                      <option key={source.id} value={source.name}>
                        {source.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Toggle
                id={fieldId("restrict")}
                label="Restrict answers to connected knowledge"
                help="When off, the project may also answer from general knowledge."
                checked={form.restrict}
                onCheckedChange={(checked) => update("restrict", checked)}
                className={fieldClass}
              />
            </div>
            {version === "v1" ? (
              retentionGroup
            ) : (
              <div role="note" className={s.bannerInfo}>
                <span>
                  Data retention for this assistant is set on the Review step
                  under the {labels.governanceTab} tab.
                </span>
              </div>
            )}
          </section>
        ) : null}

        {step === 4 ? (
          <section
            aria-labelledby={`${prefix}-step-4-heading`}
            className="grid gap-4"
          >
            <h2 id={`${prefix}-step-4-heading`} className={s.h2}>
              Review
            </h2>
            {version === "v1" ? (
              summary
            ) : (
              <Tabs.Root
                value={reviewTab}
                onValueChange={(value) =>
                  setReviewTab(
                    value === "governance" ? "governance" : "summary",
                  )
                }
              >
                <Tabs.List className={s.tabList} aria-label="Review sections">
                  <Tabs.Trigger value="summary" className={s.tab}>
                    {labels.summaryTab}
                  </Tabs.Trigger>
                  <Tabs.Trigger value="governance" className={s.tab}>
                    {labels.governanceTab}
                  </Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="summary" className={s.tabPanel}>
                  {summary}
                </Tabs.Content>
                <Tabs.Content value="governance" className={s.tabPanel}>
                  <div className="grid gap-4">
                    <p className={cn(s.muted, "m-0 text-[13px]")}>
                      Retention applies to every conversation with this
                      assistant, including exports.
                    </p>
                    {retentionGroup}
                  </div>
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
              {submitting ? "Saving…" : labels.createProject}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
