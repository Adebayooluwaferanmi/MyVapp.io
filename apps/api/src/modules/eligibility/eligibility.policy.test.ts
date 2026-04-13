import { ElectionEligibilityStatus, ElectionStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  canClaimElectionInvite,
  canUseElectionEligibilityForBallot,
  canViewElectionResults,
  canViewElectionTurnout,
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

  it("allows live turnout only for managers during open elections", () => {
    expect(canViewElectionTurnout("manager", ElectionStatus.OPEN)).toBe(true);
    expect(canViewElectionTurnout("manager", ElectionStatus.CLOSED)).toBe(false);
    expect(canViewElectionTurnout("voter", ElectionStatus.OPEN)).toBe(false);
  });

  it("allows tally visibility only after the election closes", () => {
    expect(canViewElectionResults("manager", ElectionStatus.OPEN)).toBe(false);
    expect(canViewElectionResults("manager", ElectionStatus.CLOSED)).toBe(true);
    expect(canViewElectionResults("public", ElectionStatus.ARCHIVED)).toBe(true);
  });

  it("rejects claim attempts for used or expired invites", () => {
    expect(
      canClaimElectionInvite({
        eligibilityStatus: ElectionEligibilityStatus.INVITED,
        inviteExpiresAt: new Date("2026-01-08T10:00:00.000Z"),
        inviteUsedAt: new Date("2026-01-02T10:00:00.000Z"),
        inviteRevokedAt: null,
        electionEndsAt: new Date("2026-01-10T10:00:00.000Z"),
        now: new Date("2026-01-02T11:00:00.000Z")
      })
    ).toBe(false);

    expect(
      canClaimElectionInvite({
        eligibilityStatus: ElectionEligibilityStatus.INVITED,
        inviteExpiresAt: new Date("2026-01-02T10:00:00.000Z"),
        inviteUsedAt: null,
        inviteRevokedAt: null,
        electionEndsAt: new Date("2026-01-10T10:00:00.000Z"),
        now: new Date("2026-01-02T11:00:00.000Z")
      })
    ).toBe(false);
  });

  it("only allows claimed eligibilities to access ballots during open elections", () => {
    expect(
      canUseElectionEligibilityForBallot({
        eligibilityStatus: ElectionEligibilityStatus.CLAIMED,
        electionStatus: ElectionStatus.OPEN,
        electionEndsAt: new Date("2026-01-10T10:00:00.000Z"),
        now: new Date("2026-01-05T10:00:00.000Z")
      })
    ).toBe(true);

    expect(
      canUseElectionEligibilityForBallot({
        eligibilityStatus: ElectionEligibilityStatus.VOTED,
        electionStatus: ElectionStatus.OPEN,
        electionEndsAt: new Date("2026-01-10T10:00:00.000Z"),
        now: new Date("2026-01-05T10:00:00.000Z")
      })
    ).toBe(false);
  });
});
