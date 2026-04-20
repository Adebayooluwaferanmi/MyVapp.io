import { ElectionStatus, ElectionVoterStatus } from "@prisma/client";

const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;

export type ElectionVisibilityViewer = "manager" | "chair" | "observer" | "public";

export function resolveElectionInviteExpiry(sentAt: Date, electionEndsAt: Date | null): Date {
  const defaultExpiry = new Date(sentAt.getTime() + SEVEN_DAYS_IN_MS);

  if (!electionEndsAt) {
    return defaultExpiry;
  }

  return electionEndsAt.getTime() < defaultExpiry.getTime() ? electionEndsAt : defaultExpiry;
}

export function canClaimElectionInvite(input: {
  eligibilityStatus: ElectionVoterStatus;
  inviteExpiresAt: Date;
  inviteUsedAt: Date | null;
  inviteRevokedAt: Date | null;
  electionEndsAt: Date | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();

  if (
    input.eligibilityStatus === ElectionVoterStatus.REVOKED ||
    input.eligibilityStatus === ElectionVoterStatus.CLAIMED ||
    input.eligibilityStatus === ElectionVoterStatus.VOTED ||
    input.eligibilityStatus === ElectionVoterStatus.EXPIRED
  ) {
    return false;
  }

  if (input.inviteUsedAt || input.inviteRevokedAt) {
    return false;
  }

  if (input.inviteExpiresAt.getTime() <= now.getTime()) {
    return false;
  }

  if (input.electionEndsAt && input.electionEndsAt.getTime() <= now.getTime()) {
    return false;
  }

  return true;
}

export function canUseElectionEligibilityForBallot(input: {
  eligibilityStatus: ElectionVoterStatus;
  electionStatus: ElectionStatus;
  electionEndsAt: Date | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();

  if (input.eligibilityStatus !== ElectionVoterStatus.CLAIMED) {
    return false;
  }

  if (input.electionStatus !== ElectionStatus.OPEN) {
    return false;
  }

  if (input.electionEndsAt && input.electionEndsAt.getTime() <= now.getTime()) {
    return false;
  }

  return true;
}
