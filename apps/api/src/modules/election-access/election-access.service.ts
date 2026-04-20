import crypto from "node:crypto";

import { ElectionStatus, ElectionVoterStatus } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { signAuthToken } from "../../lib/jwt";
import { prisma } from "../../lib/prisma";
import type { AuditRequestContext } from "../../lib/request-audit";
import { recordAuditLog } from "../audit/audit.service";
import { hashElectionInviteToken } from "../election-invites/election-invites.tokens";
import type { PublicElectionClaimInput } from "./election-access.schemas";

const SESSION_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

type PublicClaimInviteRecord = {
  id: string;
  electionId: string;
  electionVoterId: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
  electionVoter: {
    id: string;
    memberUniqueId: string;
    fullName: string;
    email: string;
    status: ElectionVoterStatus;
    claimedAt: Date | null;
    election: {
      id: string;
      title: string;
      status: ElectionStatus;
      startsAt: Date | null;
      endsAt: Date | null;
      invalidatePriorSessionOnNewLogin: boolean;
      organization: {
        id: string;
        name: string;
        slug: string;
      };
    };
  };
};

function getClaimInviteState(record: PublicClaimInviteRecord, now = new Date()) {
  if (record.revokedAt || record.electionVoter.status === ElectionVoterStatus.REVOKED) {
    return {
      canClaim: false,
      status: "REVOKED" as const,
      message: "This invite has been revoked."
    };
  }

  if (record.electionVoter.status === ElectionVoterStatus.VOTED) {
    return {
      canClaim: false,
      status: "VOTED" as const,
      message: "This election access has already been used to submit a ballot."
    };
  }

  if (record.usedAt || record.electionVoter.status === ElectionVoterStatus.CLAIMED) {
    return {
      canClaim: false,
      status: "CLAIMED" as const,
      message: "This invite has already been claimed."
    };
  }

  if (
    record.electionVoter.election.status === ElectionStatus.CLOSED ||
    record.electionVoter.election.status === ElectionStatus.ARCHIVED ||
    (record.electionVoter.election.endsAt && record.electionVoter.election.endsAt.getTime() <= now.getTime())
  ) {
    return {
      canClaim: false,
      status: "CLOSED" as const,
      message: "This election is no longer accepting new voter claims."
    };
  }

  if (
    record.electionVoter.status === ElectionVoterStatus.EXPIRED ||
    record.expiresAt.getTime() <= now.getTime()
  ) {
    return {
      canClaim: false,
      status: "EXPIRED" as const,
      message: "This invite has expired."
    };
  }

  return {
    canClaim: true,
    status: "ACTIVE" as const,
    message: "This invite is ready to be claimed."
  };
}

function computeSessionExpiry(electionEndsAt: Date | null, now = new Date()) {
  const defaultExpiry = new Date(now.getTime() + SESSION_DEFAULT_TTL_MS);

  if (!electionEndsAt) {
    return defaultExpiry;
  }

  return electionEndsAt.getTime() < defaultExpiry.getTime() ? electionEndsAt : defaultExpiry;
}

function generateSessionJti() {
  return crypto.randomBytes(24).toString("hex");
}

async function getPublicClaimInviteRecordOrThrow(electionSlug: string, token: string) {
  const tokenHash = hashElectionInviteToken(token);
  const invite = await prisma.electionInvite.findFirst({
    where: {
      tokenHash,
      election: {
        publicSlug: electionSlug
      }
    },
    select: {
      id: true,
      electionId: true,
      electionVoterId: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      electionVoter: {
        select: {
          id: true,
          memberUniqueId: true,
          fullName: true,
          email: true,
          status: true,
          claimedAt: true,
          election: {
            select: {
              id: true,
              title: true,
              status: true,
              startsAt: true,
              endsAt: true,
              invalidatePriorSessionOnNewLogin: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                  slug: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!invite) {
    const election = await prisma.election.findUnique({
      where: {
        publicSlug: electionSlug
      },
      select: {
        id: true
      }
    });

    if (!election) {
      throw new AppError("Election claim link not found.", 404);
    }

    throw new AppError("This election invite is invalid or no longer available.", 404);
  }

  return invite as PublicClaimInviteRecord;
}

export async function listElectionAccessAssignments(organizationId: string, electionId: string) {
  const election = await prisma.election.findFirst({
    where: {
      id: electionId,
      organizationId
    },
    select: { id: true }
  });

  if (!election) {
    throw new AppError("Election not found in this organization.", 404);
  }

  return prisma.electionAccessAssignment.findMany({
    where: {
      electionId
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true
        }
      }
    }
  });
}

export async function createElectionAccessAssignment(
  organizationId: string,
  electionId: string,
  input: {
    userId: string;
    role: "CHAIR" | "OBSERVER";
  },
  actorUserId: string,
  auditContext?: AuditRequestContext
) {
  const election = await prisma.election.findFirst({
    where: {
      id: electionId,
      organizationId
    },
    select: {
      id: true,
      title: true
    }
  });

  if (!election) {
    throw new AppError("Election not found in this organization.", 404);
  }

  return prisma.$transaction(async (transaction) => {
    const assignment = await transaction.electionAccessAssignment.create({
      data: {
        electionId,
        userId: input.userId,
        role: input.role
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true
          }
        }
      }
    });

    await recordAuditLog(
      {
        organizationId,
        electionId,
        actorUserId,
        action: "election_access.assignment_created",
        targetType: "election_access_assignment",
        targetId: assignment.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          electionTitle: election.title,
          assignedUserId: assignment.userId,
          role: assignment.role
        }
      },
      transaction
    );

    return assignment;
  });
}

export async function removeElectionAccessAssignment(
  organizationId: string,
  electionId: string,
  assignmentId: string,
  actorUserId: string,
  auditContext?: AuditRequestContext
) {
  return prisma.$transaction(async (transaction) => {
    const assignment = await transaction.electionAccessAssignment.findFirst({
      where: {
        id: assignmentId,
        electionId,
        election: {
          organizationId
        }
      },
      select: {
        id: true,
        userId: true,
        role: true
      }
    });

    if (!assignment) {
      throw new AppError("Election access assignment not found.", 404);
    }

    await transaction.electionAccessAssignment.delete({
      where: {
        id: assignmentId
      }
    });

    await recordAuditLog(
      {
        organizationId,
        electionId,
        actorUserId,
        action: "election_access.assignment_removed",
        targetType: "election_access_assignment",
        targetId: assignment.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          assignedUserId: assignment.userId,
          role: assignment.role
        }
      },
      transaction
    );
  });

  return {
    removed: true
  };
}

export async function getPublicElectionClaimContext(electionSlug: string, token: string) {
  const invite = await getPublicClaimInviteRecordOrThrow(electionSlug, token);
  const inviteState = getClaimInviteState(invite);

  return {
    election: {
      id: invite.electionVoter.election.id,
      title: invite.electionVoter.election.title,
      organizationName: invite.electionVoter.election.organization.name,
      status: invite.electionVoter.election.status,
      startsAt: invite.electionVoter.election.startsAt,
      endsAt: invite.electionVoter.election.endsAt
    },
    invite: {
      expiresAt: invite.expiresAt,
      claimed: inviteState.status === "CLAIMED" || inviteState.status === "VOTED",
      revoked: inviteState.status === "REVOKED",
      status: inviteState.status,
      canClaim: inviteState.canClaim,
      message: inviteState.message,
      email: invite.electionVoter.email
    }
  };
}

export async function claimPublicElectionInvite(
  electionSlug: string,
  input: PublicElectionClaimInput,
  auditContext?: AuditRequestContext
) {
  const invite = await getPublicClaimInviteRecordOrThrow(electionSlug, input.token);
  const inviteState = getClaimInviteState(invite);

  if (!inviteState.canClaim) {
    throw new AppError(inviteState.message, 409);
  }

  if (
    invite.electionVoter.memberUniqueId.trim().toLowerCase() !== input.memberUniqueId.trim().toLowerCase()
  ) {
    throw new AppError("The member unique ID does not match this election invite.", 422);
  }

  const result = await prisma.$transaction(async (transaction) => {
    const latestInvite = await transaction.electionInvite.findUnique({
      where: {
        id: invite.id
      },
      select: {
        id: true,
        electionId: true,
        electionVoterId: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        electionVoter: {
          select: {
            id: true,
            fullName: true,
            email: true,
            memberUniqueId: true,
            status: true,
            election: {
              select: {
                id: true,
                title: true,
                status: true,
                startsAt: true,
                endsAt: true,
                invalidatePriorSessionOnNewLogin: true,
                organization: {
                  select: {
                    id: true,
                    name: true,
                    slug: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!latestInvite) {
      throw new AppError("This election invite is no longer available.", 404);
    }

    const latestInviteState = getClaimInviteState(latestInvite as PublicClaimInviteRecord);

    if (!latestInviteState.canClaim) {
      throw new AppError(latestInviteState.message, 409);
    }

    const claimedAt = new Date();

    await transaction.electionInvite.update({
      where: {
        id: latestInvite.id
      },
      data: {
        usedAt: claimedAt
      }
    });

    await transaction.electionVoter.update({
      where: {
        id: latestInvite.electionVoter.id
      },
      data: {
        status: ElectionVoterStatus.CLAIMED,
        claimedAt
      }
    });

    if (latestInvite.electionVoter.election.invalidatePriorSessionOnNewLogin) {
      const revoked = await transaction.electionSession.updateMany({
        where: {
          electionId: latestInvite.electionId,
          electionVoterId: latestInvite.electionVoterId,
          revokedAt: null
        },
        data: {
          revokedAt: claimedAt
        }
      });

      if (revoked.count > 0) {
        await recordAuditLog(
          {
            organizationId: latestInvite.electionVoter.election.organization.id,
            electionId: latestInvite.electionId,
            actorElectionVoterId: latestInvite.electionVoterId,
            action: "election_session.revoked_prior",
            targetType: "election_session",
            metadata: {
              revokedCount: revoked.count
            }
          },
          transaction
        );
      }
    }

    const sessionJti = generateSessionJti();
    const session = await transaction.electionSession.create({
      data: {
        electionId: latestInvite.electionId,
        electionVoterId: latestInvite.electionVoterId,
        sessionJti,
        issuedAt: claimedAt,
        expiresAt: computeSessionExpiry(latestInvite.electionVoter.election.endsAt, claimedAt),
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent
      }
    });

    await recordAuditLog(
      {
        organizationId: latestInvite.electionVoter.election.organization.id,
        electionId: latestInvite.electionId,
        actorElectionVoterId: latestInvite.electionVoterId,
        action: "election_access.claimed",
        targetType: "election_voter",
        targetId: latestInvite.electionVoterId,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          electionTitle: latestInvite.electionVoter.election.title,
          memberUniqueId: latestInvite.electionVoter.memberUniqueId,
          email: latestInvite.electionVoter.email
        }
      },
      transaction
    );

    await recordAuditLog(
      {
        organizationId: latestInvite.electionVoter.election.organization.id,
        electionId: latestInvite.electionId,
        actorElectionVoterId: latestInvite.electionVoterId,
        action: "election_session.created",
        targetType: "election_session",
        targetId: session.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          sessionJti,
          expiresAt: session.expiresAt.toISOString()
        }
      },
      transaction
    );

    return {
      electionId: latestInvite.electionId,
      electionVoterId: latestInvite.electionVoterId,
      session,
      electionTitle: latestInvite.electionVoter.election.title,
      organizationName: latestInvite.electionVoter.election.organization.name,
      email: latestInvite.electionVoter.email
    };
  });

  return {
    message: `Access confirmed for ${result.organizationName} - ${result.electionTitle}.`,
    electionVoter: {
      id: result.electionVoterId,
      email: result.email
    },
    token: signAuthToken({
      sub: result.electionVoterId,
      email: result.email,
      role: "ELECTION_VOTER",
      tokenType: "election_voter",
      electionId: result.electionId,
      electionVoterId: result.electionVoterId,
      electionSessionId: result.session.id,
      electionSessionJti: result.session.sessionJti
    })
  };
}
