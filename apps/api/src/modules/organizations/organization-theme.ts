import { z } from "zod";

export const organizationThemePresets = [
  "myvapp-default",
  "civic-blue",
  "emerald-hall",
  "sunrise-coral"
] as const;

const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{6})$/, "Expected a 6-digit hex color.");

export const organizationThemeOverridesSchema = z
  .object({
    background: hexColorSchema.optional(),
    foreground: hexColorSchema.optional(),
    card: hexColorSchema.optional(),
    cardForeground: hexColorSchema.optional(),
    primary: hexColorSchema.optional(),
    primaryForeground: hexColorSchema.optional(),
    secondary: hexColorSchema.optional(),
    secondaryForeground: hexColorSchema.optional(),
    accent: hexColorSchema.optional(),
    accentForeground: hexColorSchema.optional(),
    muted: hexColorSchema.optional(),
    mutedForeground: hexColorSchema.optional(),
    border: hexColorSchema.optional(),
    input: hexColorSchema.optional(),
    ring: hexColorSchema.optional(),
    success: hexColorSchema.optional(),
    successForeground: hexColorSchema.optional(),
    warning: hexColorSchema.optional(),
    warningForeground: hexColorSchema.optional(),
    destructive: hexColorSchema.optional(),
    destructiveForeground: hexColorSchema.optional(),
    radius: z.enum(["0.75rem", "1rem", "1.25rem"]).optional()
  })
  .strict();

export const organizationThemeInputSchema = z.object({
  themePreset: z.enum(organizationThemePresets).optional(),
  themeOverrides: organizationThemeOverridesSchema.optional()
});

export const updateOrganizationThemeSchema = organizationThemeInputSchema.refine(
  (payload) => payload.themePreset !== undefined || payload.themeOverrides !== undefined,
  {
    message: "Provide a theme preset or at least one theme override."
  }
);

export type OrganizationThemePreset = (typeof organizationThemePresets)[number];
export type OrganizationThemeInput = z.infer<typeof organizationThemeInputSchema>;
export type OrganizationThemeOverrides = z.infer<typeof organizationThemeOverridesSchema>;
