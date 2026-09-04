import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4 cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper hover:bg-graphite",
        secondary: "bg-surface-2 text-ink hover:bg-surface-3",
        outline: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
        ghost: "text-ink hover:bg-surface-2",
        link: "text-ink underline-offset-4 hover:underline px-0",
        signal: "bg-signal text-paper hover:bg-signal/90",
        verdant: "bg-verdant text-paper hover:bg-verdant/90",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-6 text-base",
        xl: "h-12 rounded-md px-7 text-base",
        icon: "h-9 w-9",
        "icon-sm": "h-7 w-7",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? undefined : (type ?? "button")}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
