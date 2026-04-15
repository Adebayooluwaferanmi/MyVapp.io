import { CheckCircle2, Circle, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  organizationThemePresetDetails,
  type OrganizationThemeInput,
  type OrganizationThemeOverrides
} from "@/lib/theme";

function titleize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("space-y-6", className)}>{children}</section>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--card)_90%,white),color-mix(in_srgb,var(--secondary)_55%,white))]">
      <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--primary)]">{eyebrow}</p>
            <h1 className="font-[family:var(--font-heading)] text-4xl leading-tight text-[color:var(--foreground)] md:text-5xl">
              {title}
            </h1>
            <p className="max-w-3xl text-base text-[color:var(--muted-foreground)]">{description}</p>
          </div>
          {meta ? <div className="flex flex-wrap gap-2">{meta}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}

export function SectionCard({
  title,
  description,
  children,
  action,
  className
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-white/70 bg-white/90", className)}>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1.5">
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="border-white/70 bg-white/95">
      <CardContent className="space-y-3 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">{label}</p>
        <p className="font-[family:var(--font-heading)] text-4xl leading-none">{value}</p>
        {hint ? <p className="text-sm text-[color:var(--muted-foreground)]">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="border-dashed border-[color:var(--border)] bg-white/70">
      <CardContent className="flex min-h-52 flex-col items-center justify-center gap-3 p-10 text-center">
        <CardTitle>{title}</CardTitle>
        <CardDescription className="max-w-xl">{body}</CardDescription>
      </CardContent>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();

  if (["OPEN", "OWNER", "ADMIN", "ACTIVE"].includes(normalized)) {
    return <Badge variant="success">{titleize(status)}</Badge>;
  }

  if (["CLOSED", "ARCHIVED", "SUSPENDED"].includes(normalized)) {
    return <Badge variant="destructive">{titleize(status)}</Badge>;
  }

  if (["DRAFT", "SCHEDULED", "MEMBER", "VOTER"].includes(normalized)) {
    return <Badge variant="outline">{titleize(status)}</Badge>;
  }

  return <Badge>{titleize(status)}</Badge>;
}

export function WorkflowStep({
  label,
  meta,
  isActive,
  isComplete
}: {
  label: string;
  meta: string;
  isActive: boolean;
  isComplete: boolean;
}) {
  return (
    <Card
      className={cn(
        "border-white/70 bg-white/95",
        isActive && "border-[color:var(--primary)]/25 bg-[color:var(--secondary)]/70",
        isComplete && "border-[color:var(--success)]/20 bg-[color:var(--success)]/10"
      )}
    >
      <CardContent className="flex items-start gap-3 p-4">
        <div className="mt-1 text-[color:var(--primary)]">
          {isComplete ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">{label}</p>
          <p className="font-semibold text-[color:var(--foreground)]">{meta}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReviewPanel({
  title,
  subtitle,
  progress,
  stats,
  items,
  actions,
  notes
}: {
  title: string;
  subtitle: string;
  progress: number;
  stats: Array<{ label: string; value: string }>;
  items: Array<{ label: string; value: string }>;
  actions?: ReactNode;
  notes?: ReactNode;
}) {
  return (
    <SectionCard title={title} description={subtitle} className="sticky top-24">
      <div className="grid gap-3 md:grid-cols-2">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">{stat.label}</p>
            <p className="mt-2 text-xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>
      <Progress value={progress} />
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-white p-4">
            <p className="text-sm text-[color:var(--muted-foreground)]">{item.label}</p>
            <p className="mt-1 font-semibold">{item.value}</p>
          </div>
        ))}
      </div>
      {actions}
      {notes ? <div className="text-sm text-[color:var(--muted-foreground)]">{notes}</div> : null}
    </SectionCard>
  );
}

const colorFields: Array<{ key: keyof OrganizationThemeOverrides; label: string }> = [
  { key: "primary", label: "Primary" },
  { key: "accent", label: "Accent" },
  { key: "background", label: "Background" },
  { key: "card", label: "Card" },
  { key: "foreground", label: "Foreground" },
  { key: "border", label: "Border" }
];

export function OrganizationThemeForm({
  value,
  onChange,
  onSubmit,
  isSaving
}: {
  value: OrganizationThemeInput;
  onChange: (theme: OrganizationThemeInput) => void;
  onSubmit: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
        <label className="space-y-2 text-sm font-medium text-[color:var(--foreground)]">
          <span>Preset</span>
          <Select
            value={value.themePreset ?? "myvapp-default"}
            onValueChange={(nextPreset) =>
              onChange({
                ...value,
                themePreset: nextPreset as OrganizationThemeInput["themePreset"]
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a preset" />
            </SelectTrigger>
            <SelectContent>
              {organizationThemePresetDetails.map((preset) => (
                <SelectItem key={preset.value} value={preset.value}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {colorFields.map((field) => (
            <label key={field.key} className="space-y-2 text-sm font-medium text-[color:var(--foreground)]">
              <span>{field.label}</span>
              <Input
                type="color"
                value={(value.themeOverrides?.[field.key] as string | undefined) ?? "#2563eb"}
                onChange={(event) =>
                  onChange({
                    ...value,
                    themeOverrides: {
                      ...value.themeOverrides,
                      [field.key]: event.target.value
                    }
                  })
                }
                className="h-11 cursor-pointer rounded-[calc(var(--radius)-0.25rem)] p-1"
              />
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-4 rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/50 p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold">Theme preview</p>
          <p className="text-sm text-[color:var(--muted-foreground)]">
            Changes apply to cards, actions, emphasis, and layout chrome for this organization.
          </p>
        </div>
        <Button onClick={onSubmit} type="button" disabled={isSaving}>
          {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {isSaving ? "Saving theme..." : "Save organization theme"}
        </Button>
      </div>
    </div>
  );
}
