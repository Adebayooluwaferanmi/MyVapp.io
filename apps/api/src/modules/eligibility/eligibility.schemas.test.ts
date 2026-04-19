import { describe, expect, it } from "vitest";

import {
  previewElectionEligibilityImportSchema,
  publicElectionClaimContextQuerySchema,
  publicElectionClaimSchema,
  sendElectionInvitationsSchema
} from "./eligibility.schemas";

describe("eligibility schemas", () => {
  it("accepts preview payloads for csv and xlsx imports", () => {
    expect(
      previewElectionEligibilityImportSchema.parse({
        filename: "voter-registry.csv",
        format: "CSV",
        contentBase64: "bWVtYmVyX3VuaXF1ZV9pZCxmdWxsX25hbWUsZW1haWwscGhvbmU="
      })
    ).toMatchObject({
      filename: "voter-registry.csv",
      format: "CSV"
    });
  });

  it("rejects invalid public claim payloads", () => {
    const result = publicElectionClaimSchema.safeParse({
      token: "short",
      memberUniqueId: ""
    });

    expect(result.success).toBe(false);
  });

  it("requires a token for claim context", () => {
    const result = publicElectionClaimContextQuerySchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("accepts targeted or bulk invitation send payloads", () => {
    expect(sendElectionInvitationsSchema.parse({})).toEqual({});
    expect(
      sendElectionInvitationsSchema.parse({
        eligibilityIds: ["cm11111111111111111111111"]
      })
    ).toMatchObject({
      eligibilityIds: ["cm11111111111111111111111"]
    });
  });
});
