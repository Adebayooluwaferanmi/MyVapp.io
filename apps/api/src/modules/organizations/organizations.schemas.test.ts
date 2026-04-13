import { describe, expect, it } from "vitest";

import {
  createOrganizationMemberSchema,
  createOrganizationSchema,
  updateOrganizationThemeBodySchema,
  updateOrganizationMemberRoleSchema
} from "./organizations.schemas";

describe("organization schemas", () => {
  it("accepts a valid organization payload", () => {
    const payload = createOrganizationSchema.parse({
      name: "National Member Council",
      description: "Umbrella body for organization elections.",
      themePreset: "civic-blue",
      themeOverrides: {
        primary: "#1d4ed8",
        accent: "#0f766e"
      }
    });

    expect(payload.name).toBe("National Member Council");
    expect(payload.themePreset).toBe("civic-blue");
  });

  it("rejects an organization name that is too short", () => {
    const result = createOrganizationSchema.safeParse({
      name: "AB"
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid organization member payload", () => {
    const payload = createOrganizationMemberSchema.parse({
      firstName: "Ada",
      lastName: "Okafor",
      email: "ada@example.com",
      role: "VOTER"
    });

    expect(payload.role).toBe("VOTER");
  });

  it("accepts a valid organization theme update payload", () => {
    const payload = updateOrganizationThemeBodySchema.parse({
      themePreset: "sunrise-coral",
      themeOverrides: {
        primary: "#c2410c",
        accent: "#ea580c",
        radius: "1rem"
      }
    });

    expect(payload.themePreset).toBe("sunrise-coral");
    expect(payload.themeOverrides?.radius).toBe("1rem");
  });

  it("rejects invalid organization theme overrides", () => {
    const result = updateOrganizationThemeBodySchema.safeParse({
      themeOverrides: {
        primary: "#12345"
      }
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid organization member role update", () => {
    const result = updateOrganizationMemberRoleSchema.safeParse({
      role: "TREASURER"
    });

    expect(result.success).toBe(false);
  });
});
