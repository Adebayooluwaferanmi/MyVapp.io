import { describe, expect, it } from "vitest";

import {
  createOrganizationMemberSchema,
  createOrganizationSchema,
  updateOrganizationMemberRoleSchema
} from "./organizations.schemas";

describe("organization schemas", () => {
  it("accepts a valid organization payload", () => {
    const payload = createOrganizationSchema.parse({
      name: "National Alumni Council",
      description: "Umbrella body for alumni elections."
    });

    expect(payload.name).toBe("National Alumni Council");
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

  it("rejects an invalid organization member role update", () => {
    const result = updateOrganizationMemberRoleSchema.safeParse({
      role: "TREASURER"
    });

    expect(result.success).toBe(false);
  });
});
