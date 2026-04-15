import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[calc(var(--radius)-0.25rem)] bg-[color:var(--muted)]", className)} />;
}
