import * as React from "react";

import { cn } from "@/lib/utils";

export function Progress({
  className,
  value = 0
}: {
  className?: string;
  value?: number;
}) {
  return (
    <div className={cn("relative h-3 w-full overflow-hidden rounded-full bg-[color:var(--secondary)]", className)}>
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,var(--primary),var(--accent))] transition-all"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
