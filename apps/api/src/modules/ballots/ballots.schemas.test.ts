import { describe, expect, it } from "vitest";

import { submitBallotSchema } from "./ballots.schemas";

describe("ballot schemas", () => {
  it("accepts a valid ballot payload", () => {
    const payload = submitBallotSchema.parse({
      selections: [
        {
          officeId: "cm9hpv8kj0001abc123456789",
          candidateId: "cm9hpv8kj0002abc123456789"
        }
      ]
    });

    expect(payload.selections).toHaveLength(1);
  });

  it("rejects an empty ballot payload", () => {
    const result = submitBallotSchema.safeParse({
      selections: []
    });

    expect(result.success).toBe(false);
  });
});
