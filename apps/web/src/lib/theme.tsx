import { createContext, useContext, useMemo, useState, type CSSProperties, type ReactNode } from "react";

export const organizationThemePresets = [
  "myvapp-default",
  "civic-blue",
  "emerald-hall",
  "sunrise-coral"
] as const;

export type OrganizationThemePreset = (typeof organizationThemePresets)[number];

export type OrganizationThemeOverrides = Partial<{
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  ring: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  destructive: string;
  destructiveForeground: string;
  radius: "0.75rem" | "1rem" | "1.25rem";
}>;

export type OrganizationThemeInput = {
  themePreset?: OrganizationThemePreset;
  themeOverrides?: OrganizationThemeOverrides;
};

type ThemeTokens = Required<OrganizationThemeOverrides> & {
  fontBody: string;
  fontHeading: string;
};

const themePresetMap: Record<OrganizationThemePreset, ThemeTokens> = {
  "myvapp-default": {
    background: "#f7f8fc",
    foreground: "#0f172a",
    card: "#ffffff",
    cardForeground: "#0f172a",
    primary: "#2563eb",
    primaryForeground: "#eff6ff",
    secondary: "#e0f2fe",
    secondaryForeground: "#0f172a",
    accent: "#14b8a6",
    accentForeground: "#042f2e",
    muted: "#eef2ff",
    mutedForeground: "#475569",
    border: "#dbe4f0",
    input: "#d6deeb",
    ring: "#60a5fa",
    success: "#16a34a",
    successForeground: "#f0fdf4",
    warning: "#f59e0b",
    warningForeground: "#451a03",
    destructive: "#dc2626",
    destructiveForeground: "#fef2f2",
    radius: "1rem",
    fontBody: "\"DM Sans\", system-ui, sans-serif",
    fontHeading: "\"Source Serif 4\", Georgia, serif"
  },
  "civic-blue": {
    background: "#f4f7fb",
    foreground: "#10233f",
    card: "#ffffff",
    cardForeground: "#10233f",
    primary: "#1447e6",
    primaryForeground: "#eff6ff",
    secondary: "#dbeafe",
    secondaryForeground: "#10233f",
    accent: "#0f766e",
    accentForeground: "#ecfeff",
    muted: "#eff6ff",
    mutedForeground: "#52627a",
    border: "#cfdbeb",
    input: "#c6d5e8",
    ring: "#3b82f6",
    success: "#15803d",
    successForeground: "#f0fdf4",
    warning: "#d97706",
    warningForeground: "#fff7ed",
    destructive: "#b91c1c",
    destructiveForeground: "#fef2f2",
    radius: "1rem",
    fontBody: "\"DM Sans\", system-ui, sans-serif",
    fontHeading: "\"Source Serif 4\", Georgia, serif"
  },
  "emerald-hall": {
    background: "#f4fbf7",
    foreground: "#0f2a1d",
    card: "#ffffff",
    cardForeground: "#0f2a1d",
    primary: "#0f766e",
    primaryForeground: "#f0fdfa",
    secondary: "#dcfce7",
    secondaryForeground: "#14532d",
    accent: "#65a30d",
    accentForeground: "#1a2e05",
    muted: "#ecfdf5",
    mutedForeground: "#4b6358",
    border: "#cde6d6",
    input: "#c7dfd0",
    ring: "#34d399",
    success: "#15803d",
    successForeground: "#f0fdf4",
    warning: "#ca8a04",
    warningForeground: "#fefce8",
    destructive: "#dc2626",
    destructiveForeground: "#fef2f2",
    radius: "1.25rem",
    fontBody: "\"DM Sans\", system-ui, sans-serif",
    fontHeading: "\"Source Serif 4\", Georgia, serif"
  },
  "sunrise-coral": {
    background: "#fff8f5",
    foreground: "#3a1b14",
    card: "#ffffff",
    cardForeground: "#3a1b14",
    primary: "#ea580c",
    primaryForeground: "#fff7ed",
    secondary: "#ffedd5",
    secondaryForeground: "#7c2d12",
    accent: "#db2777",
    accentForeground: "#fff1f2",
    muted: "#fff1f2",
    mutedForeground: "#7c5d55",
    border: "#f0d8ce",
    input: "#ebcfc3",
    ring: "#fb7185",
    success: "#16a34a",
    successForeground: "#f0fdf4",
    warning: "#f59e0b",
    warningForeground: "#451a03",
    destructive: "#c2410c",
    destructiveForeground: "#fff7ed",
    radius: "1.25rem",
    fontBody: "\"DM Sans\", system-ui, sans-serif",
    fontHeading: "\"Source Serif 4\", Georgia, serif"
  }
};

type AppThemeContextValue = {
  theme: OrganizationThemeInput;
  setTheme: (theme: OrganizationThemeInput) => void;
  resolvedTheme: ThemeTokens;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function resolveTheme(theme: OrganizationThemeInput): ThemeTokens {
  const preset = themePresetMap[theme.themePreset ?? "myvapp-default"];

  return {
    ...preset,
    ...theme.themeOverrides
  };
}

function toCssVariables(theme: ThemeTokens): CSSProperties {
  return {
    "--background": theme.background,
    "--foreground": theme.foreground,
    "--card": theme.card,
    "--card-foreground": theme.cardForeground,
    "--primary": theme.primary,
    "--primary-foreground": theme.primaryForeground,
    "--secondary": theme.secondary,
    "--secondary-foreground": theme.secondaryForeground,
    "--accent": theme.accent,
    "--accent-foreground": theme.accentForeground,
    "--muted": theme.muted,
    "--muted-foreground": theme.mutedForeground,
    "--border": theme.border,
    "--input": theme.input,
    "--ring": theme.ring,
    "--success": theme.success,
    "--success-foreground": theme.successForeground,
    "--warning": theme.warning,
    "--warning-foreground": theme.warningForeground,
    "--destructive": theme.destructive,
    "--destructive-foreground": theme.destructiveForeground,
    "--radius": theme.radius,
    "--font-body": theme.fontBody,
    "--font-heading": theme.fontHeading
  } as CSSProperties;
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<OrganizationThemeInput>({
    themePreset: "myvapp-default"
  });

  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);
  const value = useMemo(
    () => ({
      theme,
      setTheme,
      resolvedTheme
    }),
    [resolvedTheme, theme]
  );

  return (
    <AppThemeContext.Provider value={value}>
      <div style={toCssVariables(resolvedTheme)}>{children}</div>
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);

  if (!context) {
    throw new Error("useAppTheme must be used within AppThemeProvider.");
  }

  return context;
}

export const organizationThemePresetDetails = organizationThemePresets.map((preset) => ({
  value: preset,
  label: preset
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}));
