"use client";
import * as React from "react";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import s from "../billing.module.css";

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
  return <button ref={ref} type={type} className={cn(variantClass[variant], size === "sm" && s.btnSm, className)} {...props} />;
});

export function LinkButton({
  href,
  variant = "secondary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={cn(variantClass[variant], size === "sm" && s.btnSm, className)}>
      {children}
    </Link>
  );
}

// ───────────────────────────── Layout ─────────────────────────────

export function PageHeader({
  title,
  titleId,
  description,
  actions,
  meta,
}: {
  title: React.ReactNode;
  titleId?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 id={titleId} className={s.h1}>
            {title}
          </h1>
          {meta}
        </div>
        {description ? <p className={cn(s.muted, "mt-1")}>{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className={cn(s.muted, "mb-2 text-xs")}>
      {items.map((item, index) => (
        <React.Fragment key={`${item.label}-${index}`}>
          {index > 0 ? <span aria-hidden="true"> / </span> : null}
          {item.href ? (
            <Link href={item.href} className={s.link}>
              {item.label}
            </Link>
          ) : (
            <span>{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
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

export function Banner({
  tone,
  children,
  onDismiss,
  className,
  icon,
}: {
  tone: "success" | "info" | "warning" | "danger";
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
  icon?: React.ReactNode;
}) {
  const cls = tone === "success" ? s.bannerSuccess : tone === "info" ? s.bannerInfo : tone === "warning" ? s.bannerWarning : s.bannerDanger;
  return (
    <div role="status" className={cn(cls, "items-center", className)}>
      {icon}
      <div className="flex-1">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-inherit hover:bg-white/60"
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </div>
  );
}

// ───────────────────────────── Badges ─────────────────────────────

const BADGE_TONE: Record<string, string> = {
  // Payments
  Succeeded: "green",
  Failed: "red",
  Refunded: "gray",
  "Partially refunded": "amber",
  // Disputes
  Open: "red",
  "Under review": "amber",
  Resolved: "green",
  "No dispute": "gray",
  // Invoices
  Draft: "gray",
  "Past due": "red",
  Paid: "green",
  Void: "gray",
  // Subscriptions
  Active: "green",
  Paused: "amber",
  Canceled: "gray",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = BADGE_TONE[status] ?? "blue";
  const cls = tone === "green" ? s.badgeGreen : tone === "red" ? s.badgeRed : tone === "amber" ? s.badgeAmber : tone === "gray" ? s.badgeGray : s.badgeBlue;
  return <span className={cls}>{status}</span>;
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
