"use client";
import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Inbox, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import s from "../erp.module.css";

// ───────────────────────────── Buttons ─────────────────────────────

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const variantClass: Record<ButtonVariant, string> = {
  primary: s.btnPrimary,
  secondary: s.btnSecondary,
  danger: s.btnDanger,
  ghost: s.btnGhost,
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(variantClass[variant], size === "sm" && s.btnSm, className)} {...props} />;
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

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className={cn(s.muted, "mb-2 text-xs")}>
      {items.map((entry, index) => (
        <React.Fragment key={`${entry.label}-${index}`}>
          {index > 0 ? <span aria-hidden="true"> / </span> : null}
          {entry.href ? (
            <Link href={entry.href} className={s.link}>
              {entry.label}
            </Link>
          ) : (
            <span aria-current="page">{entry.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

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

/** Object-page header: title, subtitle, status and a row of key facts. */
export function ObjectHeader({
  title,
  subtitle,
  meta,
  facts,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  facts?: { label: string; value: React.ReactNode }[];
  actions?: React.ReactNode;
}) {
  return (
    <header className={s.objectHeader}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className={s.h1}>{title}</h1>
            {meta}
          </div>
          {subtitle ? <p className={cn(s.muted, "mt-1")}>{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {facts && facts.length ? (
        <div className={s.facts}>
          {facts.map((fact) => (
            <div key={fact.label}>
              <span className={s.factLabel}>{fact.label}</span>
              <span className={s.factValue}>{fact.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </header>
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

/** Footer action bar: secondary actions on the left, the primary action on the right. */
export function ActionBar({ start, children, className }: { start?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn(s.actionBar, className)}>
      <div className="flex flex-wrap items-center gap-2">{start}</div>
      <div className={s.actionBarEnd}>{children}</div>
    </div>
  );
}

// ───────────────────────────── Launchpad tiles ─────────────────────────────

export function TileGroup({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mb-6">
      <h2 id={`${id}-heading`} className={cn(s.h2, "mb-3")}>
        {title}
      </h2>
      <div className={s.tileGrid}>{children}</div>
    </section>
  );
}

export function Tile({
  id,
  href,
  title,
  subtitle,
  number,
  unit,
  icon: Icon,
}: {
  id: string;
  href: string;
  title: string;
  subtitle?: string;
  number?: React.ReactNode;
  unit?: string;
  icon?: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean | "true" }>;
}) {
  const titleId = `${id}-title`;
  return (
    <Link href={href} className={s.tile} aria-labelledby={titleId}>
      <span>
        <span id={titleId} className={s.tileTitle}>
          {title}
        </span>
        {subtitle ? <span className={s.tileSub}>{subtitle}</span> : null}
      </span>
      <span className={s.tileFoot}>
        <span>
          {number !== undefined ? <span className={cn(s.tileNumber, "block")}>{number}</span> : null}
          {unit ? <span className={s.tileUnit}>{unit}</span> : null}
        </span>
        {Icon ? <Icon size={22} className={s.tileIcon} aria-hidden="true" /> : null}
      </span>
    </Link>
  );
}

// ───────────────────────────── Feedback ─────────────────────────────

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

export function Banner({
  kind = "success",
  title,
  children,
  onDismiss,
  className,
}: {
  kind?: "success" | "info" | "warning";
  title: string;
  children?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const cls = kind === "success" ? s.bannerSuccess : kind === "warning" ? s.bannerWarning : s.bannerInfo;
  const Icon = kind === "success" ? CheckCircle2 : Info;
  return (
    <div role="status" className={cn(cls, "items-center", className)}>
      <Icon size={18} aria-hidden="true" className="shrink-0" />
      <div className="flex-1">
        <strong>{title}</strong>
        {children ? <span className="ml-1">{children}</span> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-inherit hover:bg-white/60"
        >
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
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
    status === "Submitted"
      ? s.badgeBlue
      : status === "Approved"
        ? s.badgeGreen
        : status === "Returned"
          ? s.badgeAmber
          : status === "Blocked"
            ? s.badgeRed
            : status === "Active"
              ? s.badgeGreen
              : s.badgeGray;
  return <span className={cls}>{status}</span>;
}

// ───────────────────────────── Tables ─────────────────────────────

export function Table({ children, caption, className }: { children: React.ReactNode; caption?: string; className?: string }) {
  return (
    <div className={s.tableWrap}>
      <table className={cn(s.table, className)}>
        {caption ? <caption className={s.srOnly}>{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

// ───────────────────────────── Definition list ─────────────────────────────

export type DefinitionValue = React.ReactNode | string[];

export function DefinitionList({ rows }: { rows: { label: string; value: DefinitionValue }[] }) {
  return (
    <dl className={s.dl}>
      {rows.map((row) => (
        <React.Fragment key={row.label}>
          <dt>{row.label}</dt>
          <dd>
            {Array.isArray(row.value) ? (
              row.value.length === 0 ? (
                <span className={s.faint}>—</span>
              ) : (
                <ul>
                  {row.value.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              )
            ) : row.value === "" || row.value === null || row.value === undefined ? (
              <span className={s.faint}>—</span>
            ) : (
              row.value
            )}
          </dd>
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
  /** Visually hide the label (the control still has a real <label for>). */
  hideLabel?: boolean;
  children: (a: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
}

/** Label + control + help + error. The child render-prop receives the ids to wire ARIA. */
export function Field({ id, label, required, help, error, className, hideLabel, children }: FieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? s.srOnly : s.label}>
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
