import { describe, expect, it } from "vitest";

import {
  createCandidateSchema,
  createElectionSchema,
  createOfficeSchema,
  updateElectionStatusSchema
} from "./elections.schemas";

describe("election schemas", () => {
  it("accepts a valid election payload", () => {
    const payload = createElectionSchema.parse({
      title: "2026 Executive Council Election",
      description: "General election for executive council roles.",
      startsAt: "2026-06-01T09:00:00.000Z",
      endsAt: "2026-06-01T17:00:00.000Z"
    });

    expect(payload.title).toBe("2026 Executive Council Election");
  });

  it("rejects an election that ends before it starts", () => {
    const result = createElectionSchema.safeParse({
      title: "2026 Executive Council Election",
      startsAt: "2026-06-01T17:00:00.000Z",
      endsAt: "2026-06-01T09:00:00.000Z"
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid office payload", () => {
    const payload = createOfficeSchema.parse({
      title: "President",
      seats: 1,
      sortOrder: 0
    });

    expect(payload.title).toBe("President");
  });

  it("accepts a valid candidate payload", () => {
    const payload = createCandidateSchema.parse({
      displayName: "Ada Okafor",
      bio: "Current welfare chair."
    });

    expect(payload.displayName).toBe("Ada Okafor");
  });

  it("accepts a valid status update payload", () => {
    const payload = updateElectionStatusSchema.parse({
      status: "OPEN"
    });

    expect(payload.status).toBe("OPEN");
  });
});
