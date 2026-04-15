import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
  {
    variants: {
      variant: {
        default: "bg-[color:var(--secondary)] text-[color:var(--secondary-foreground)]",
        outline: "border border-[color:var(--border)] bg-white/80 text-[color:var(--foreground)]",
        success: "bg-[color:var(--success)]/15 text-[color:var(--success)]",
        warning: "bg-[color:var(--warning)]/18 text-[color:var(--warning-foreground)]",
        destructive: "bg-[color:var(--destructive)]/15 text-[color:var(--destructive)]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
