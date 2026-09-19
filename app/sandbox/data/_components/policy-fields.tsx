"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { POLICY_COMMANDS, POLICY_ROLES, type PolicyCommand, type PolicyRole } from "../_lib/db";
import { Field, inputClass, inputMonoClass, selectClass } from "./ui";

export interface PolicyDraft {
  name: string;
  role: PolicyRole;
  command: PolicyCommand;
  using: string;
}

export const DEFAULT_POLICY: PolicyDraft = { name: "", role: "anon", command: "SELECT", using: "auth.uid() = user_id" };

export interface PolicyErrors {
  name?: string;
  using?: string;
}

/** Validates a policy draft. `requireName` is used by the standalone "Add policy" dialog. */
export function validatePolicy(policy: PolicyDraft, requireName: boolean): PolicyErrors {
  const errors: PolicyErrors = {};
  const name = policy.name.trim();
  if (requireName && !name) errors.name = "Enter a policy name";
  if ((requireName || name) && !policy.using.trim()) errors.using = "Enter a using expression";
  return errors;
}

/**
 * Policy name / Role / Command / Using expression. Labels are plain and
 * identical in both UI versions; only ids and classes change with the prefix.
 */
export function PolicyFields({
  idPrefix,
  value,
  onChange,
  errors = {},
  fieldClass,
  controlClass,
  nameRequired,
}: {
  idPrefix: string;
  value: PolicyDraft;
  onChange: (next: PolicyDraft) => void;
  errors?: PolicyErrors;
  fieldClass?: string;
  controlClass?: string;
  nameRequired?: boolean;
}) {
  const update = <K extends keyof PolicyDraft>(key: K, next: PolicyDraft[K]) => onChange({ ...value, [key]: next });
  return (
    <div className="grid gap-4">
      <Field id={`${idPrefix}-policy-name`} label="Policy name" required={nameRequired} error={errors.name} className={fieldClass}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            type="text"
            name="policyName"
            className={cn(inputClass, controlClass)}
            value={value.name}
            placeholder="e.g. Users read own rows"
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => update("name", event.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${idPrefix}-policy-role`} label="Role" className={fieldClass}>
          {({ id }) => (
            <select id={id} name="policyRole" className={cn(selectClass, controlClass)} value={value.role} onChange={(event) => update("role", event.target.value as PolicyRole)}>
              {POLICY_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id={`${idPrefix}-policy-command`} label="Command" className={fieldClass}>
          {({ id }) => (
            <select
              id={id}
              name="policyCommand"
              className={cn(selectClass, controlClass)}
              value={value.command}
              onChange={(event) => update("command", event.target.value as PolicyCommand)}
            >
              {POLICY_COMMANDS.map((command) => (
                <option key={command} value={command}>
                  {command}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field
        id={`${idPrefix}-policy-using`}
        label="Using expression"
        help="SQL boolean expression evaluated per row. auth.uid() is the signed-in user."
        error={errors.using}
        className={fieldClass}
      >
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            type="text"
            name="policyUsing"
            className={cn(inputMonoClass, controlClass)}
            value={value.using}
            spellCheck={false}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => update("using", event.target.value)}
          />
        )}
      </Field>
    </div>
  );
}
