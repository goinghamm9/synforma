"use client";
import * as React from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import s from "../crm.module.css";

// ───────────────────────────── Buttons ─────────────────────────────

type ButtonVariant = "primary" | "secondary" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary: s.btnPrimary,
  secondary: s.btnSecondary,
  danger: s.btnDanger,
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(variantClass[variant], size === "sm" && s.btnSm, className)} {...props} />
  );
});

export function LinkButton({
  href,
  variant = "secondary",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(variantClass[variant], className)}>
      {children}
    </Link>
  );
}

// ───────────────────────────── Layout ─────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className={s.h1}>{title}</h1>
          {meta}
        </div>
        {description ? <p className={cn(s.muted, "mt-1")}>{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
  bodyClassName,
  as: Tag = "section",
  ariaLabel,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div";
  ariaLabel?: string;
}) {
  return (
    <Tag className={cn(s.card, className)} aria-label={ariaLabel}>
      {title ? (
        <div className={s.cardHeader}>
          <h2 className={s.h2}>{title}</h2>
          {actions}
        </div>
      ) : null}
      <div className={cn(s.cardBody, bodyClassName)}>{children}</div>
    </Tag>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className={cn(s.card, s.cardBody)}>
      <div className={cn(s.h3, "mb-2")}>{label}</div>
      <div className={s.stat}>{value}</div>
      {hint ? <div className={cn(s.muted, "mt-1 text-xs")}>{hint}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Inbox className={s.faint} size={28} aria-hidden="true" />
      <p className="font-semibold">{title}</p>
      {description ? <p className={cn(s.muted, "max-w-md text-[13px]")}>{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn(s.skeleton, className)} aria-hidden="true" />;
}

export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className={s.srOnly}>Loading</span>
      <Skeleton className="mb-4 h-7 w-56" />
      <div className={cn(s.card, s.cardBody, "space-y-3")}>
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── Badges ─────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "New"
      ? s.badgeBlue
      : status === "Working"
        ? s.badgeAmber
        : status === "Nurturing"
          ? s.badgeGray
          : s.badgeGray;
  return <span className={cls}>{status}</span>;
}

export function StageBadge({ stage }: { stage: string }) {
  const cls =
    stage === "Prospecting"
      ? s.badgeGray
      : stage === "Qualification"
        ? s.badgeBlue
        : stage === "Proposal"
          ? s.badgePurple
          : stage === "Negotiation"
            ? s.badgeGreen
            : s.badgeGray;
  return <span className={cls}>{stage}</span>;
}

// ───────────────────────────── Tables ─────────────────────────────

export function Table({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        {caption ? <caption className={s.srOnly}>{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

// ───────────────────────────── Definition list ─────────────────────────────

export function DefinitionList({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className={s.dl}>
      {rows.map((row) => (
        <React.Fragment key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value === "" || row.value === null || row.value === undefined ? <span className={s.faint}>—</span> : row.value}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

// ───────────────────────────── Form fields ─────────────────────────────

export interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  error?: string;
  className?: string;
  children: (a: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

/** Label + control + help + error. The child render-prop receives the ids to wire ARIA. */
export function Field({ id, label, required, help, error, className, children }: FieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className={s.label}>
        {label}
        {required ? (
          <span className={s.required} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {help ? (
        <p id={helpId} className={s.help}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className={s.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass = s.control;
export const selectClass = s.select;
export const textareaClass = s.textarea;
