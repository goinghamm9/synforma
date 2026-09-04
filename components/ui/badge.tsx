import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-ink text-paper",
        outline: "border-line-strong bg-transparent text-graphite",
        muted: "border-transparent bg-surface-2 text-slate",
        signal: "border-transparent bg-signal-soft text-signal",
        verdant: "border-transparent bg-verdant-soft text-verdant",
        amber: "border-transparent bg-amber-soft text-amber",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
