import { ElectionEligibilityStatus, ElectionStatus } from "@prisma/client";

const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;

export type ElectionVisibilityViewer = "manager" | "voter" | "public";

export function resolveElectionInviteExpiry(sentAt: Date, electionEndsAt: Date | null): Date {
  const defaultExpiry = new Date(sentAt.getTime() + SEVEN_DAYS_IN_MS);

  if (!electionEndsAt) {
    return defaultExpiry;
  }

  return electionEndsAt.getTime() < defaultExpiry.getTime() ? electionEndsAt : defaultExpiry;
}

export function canViewElectionTurnout(
  viewer: ElectionVisibilityViewer,
  electionStatus: ElectionStatus
): boolean {
  return viewer === "manager" && electionStatus === ElectionStatus.OPEN;
}

export function canViewElectionResults(
  viewer: ElectionVisibilityViewer,
  electionStatus: ElectionStatus
): boolean {
  if (electionStatus !== ElectionStatus.CLOSED && electionStatus !== ElectionStatus.ARCHIVED) {
    return false;
  }

  return viewer === "manager" || viewer === "voter" || viewer === "public";
}

export function canClaimElectionInvite(input: {
  eligibilityStatus: ElectionEligibilityStatus;
  inviteExpiresAt: Date;
  inviteUsedAt: Date | null;
  inviteRevokedAt: Date | null;
  electionEndsAt: Date | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();

  if (
    input.eligibilityStatus === ElectionEligibilityStatus.REVOKED ||
    input.eligibilityStatus === ElectionEligibilityStatus.CLAIMED ||
    input.eligibilityStatus === ElectionEligibilityStatus.VOTED ||
    input.eligibilityStatus === ElectionEligibilityStatus.EXPIRED
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
  eligibilityStatus: ElectionEligibilityStatus;
  electionStatus: ElectionStatus;
  electionEndsAt: Date | null;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();

  if (input.eligibilityStatus !== ElectionEligibilityStatus.CLAIMED) {
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
