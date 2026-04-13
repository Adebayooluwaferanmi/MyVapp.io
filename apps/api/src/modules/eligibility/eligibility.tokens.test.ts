import { describe, expect, it } from "vitest";

import { generateElectionInviteToken, hashElectionInviteToken } from "./eligibility.tokens";

describe("eligibility tokens", () => {
  it("generates opaque invite tokens", () => {
    const token = generateElectionInviteToken();

    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it("hashes invite tokens deterministically", () => {
    const token = "example-election-invite-token-123456";

    expect(hashElectionInviteToken(token)).toBe(hashElectionInviteToken(token));
    expect(hashElectionInviteToken(token)).not.toBe(token);
  });
});
