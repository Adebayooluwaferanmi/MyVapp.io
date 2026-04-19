import { ElectionStatus, ElectionVoterStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  canClaimElectionInvite,
  canUseElectionEligibilityForBallot,
  resolveElectionInviteExpiry
} from "./eligibility.policy";

describe("eligibility policy", () => {
  it("caps invite expiry at seven days when the election end is later", () => {
    const sentAt = new Date("2026-01-01T10:00:00.000Z");
    const endsAt = new Date("2026-01-20T10:00:00.000Z");

    expect(resolveElectionInviteExpiry(sentAt, endsAt).toISOString()).toBe("2026-01-08T10:00:00.000Z");
  });

  it("caps invite expiry at the election end when the election ends sooner", () => {
    const sentAt = new Date("2026-01-01T10:00:00.000Z");
    const endsAt = new Date("2026-01-03T10:00:00.000Z");

    expect(resolveElectionInviteExpiry(sentAt, endsAt).toISOString()).toBe("2026-01-03T10:00:00.000Z");
  });

  it("rejects claim attempts for used or expired invites", () => {
    expect(
      canClaimElectionInvite({
        eligibilityStatus: ElectionVoterStatus.INVITED,
        inviteExpiresAt: new Date("2026-01-08T10:00:00.000Z"),
        inviteUsedAt: new Date("2026-01-02T10:00:00.000Z"),
        inviteRevokedAt: null,
        electionEndsAt: new Date("2026-01-10T10:00:00.000Z"),
        now: new Date("2026-01-02T11:00:00.000Z")
      })
    ).toBe(false);

    expect(
      canClaimElectionInvite({
        eligibilityStatus: ElectionVoterStatus.INVITED,
        inviteExpiresAt: new Date("2026-01-02T10:00:00.000Z"),
        inviteUsedAt: null,
        inviteRevokedAt: null,
        electionEndsAt: new Date("2026-01-10T10:00:00.000Z"),
        now: new Date("2026-01-02T11:00:00.000Z")
      })
    ).toBe(false);
  });

  it("only allows claimed voters to access ballots during open elections", () => {
    expect(
      canUseElectionEligibilityForBallot({
        eligibilityStatus: ElectionVoterStatus.CLAIMED,
        electionStatus: ElectionStatus.OPEN,
        electionEndsAt: new Date("2026-01-10T10:00:00.000Z"),
        now: new Date("2026-01-05T10:00:00.000Z")
      })
    ).toBe(true);

    expect(
      canUseElectionEligibilityForBallot({
        eligibilityStatus: ElectionVoterStatus.VOTED,
        electionStatus: ElectionStatus.OPEN,
        electionEndsAt: new Date("2026-01-10T10:00:00.000Z"),
        now: new Date("2026-01-05T10:00:00.000Z")
      })
    ).toBe(false);
  });
});
