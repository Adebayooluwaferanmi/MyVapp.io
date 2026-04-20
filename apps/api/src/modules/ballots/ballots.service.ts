import crypto from "node:crypto";

import {
  ElectionAccessRole,
  ElectionResultsVisibility,
  ElectionStatus,
  ElectionVoterStatus,
  MembershipRole,
  UserRole
} from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import type { AuditRequestContext } from "../../lib/request-audit";
import { recordAuditLog } from "../audit/audit.service";
import type { SubmitBallotInput } from "./ballots.schemas";

type AuthPrincipal = {
  sub: string;
  email: string;
  role: string;
  tokenType?: "user" | "election_voter";
  electionId?: string;
  electionVoterId?: string;
  electionSessionId?: string;
};

const managerRoles = new Set<MembershipRole>([MembershipRole.OWNER, MembershipRole.ADMIN]);

async function getElectionOrThrow(organizationId: string, electionId: string) {
  const election = await prisma.election.findFirst({
    where: {
      id: electionId,
      organizationId
    },
    include: {
      offices: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          candidates: {
            orderBy: {
              createdAt: "asc"
            }
          }
        }
      },
      organization: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!election) {
    throw new AppError("Election not found in this organization.", 404);
  }

  return election;
}

async function getElectionByPublicSlugOrThrow(electionSlug: string) {
  const election = await prisma.election.findUnique({
    where: {
      publicSlug: electionSlug
    },
    include: {
      offices: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          candidates: {
            orderBy: {
              createdAt: "asc"
            }
          }
        }
      }
    }
  });

  if (!election) {
    throw new AppError("Election not found.", 404);
  }

  return election;
}

function isElectionOpenForVoting(electionStatus: ElectionStatus, electionEndsAt: Date | null, now = new Date()) {
  if (electionStatus !== ElectionStatus.OPEN) {
    return false;
  }

  if (electionEndsAt && electionEndsAt.getTime() <= now.getTime()) {
    return false;
  }

  return true;
}

function assertElectionVoterPrincipal(principal: AuthPrincipal, electionId: string) {
  if (principal.tokenType !== "election_voter") {
    throw new AppError("Election voter session is required for ballot access.", 403);
  }

  if (
    !principal.electionVoterId ||
    !principal.electionSessionId ||
    !principal.electionId ||
    principal.electionId !== electionId
  ) {
    throw new AppError("Election-scoped session context is invalid.", 403);
  }

  return {
    electionVoterId: principal.electionVoterId,
    electionSessionId: principal.electionSessionId
  };
}

async function getElectionVoterOrThrow(organizationId: string, electionId: string, electionVoterId: string) {
  const voter = await prisma.electionVoter.findFirst({
    where: {
      id: electionVoterId,
      electionId,
      election: {
        organizationId
      }
    },
    select: {
      id: true,
      status: true,
      votedAt: true,
      electionId: true
    }
  });

  if (!voter) {
    throw new AppError("You do not have election access for this ballot.", 403);
  }

  if (voter.status === ElectionVoterStatus.REVOKED || voter.status === ElectionVoterStatus.EXPIRED) {
    throw new AppError("Your election access is no longer active.", 403);
  }

  return voter;
}

async function assertSessionIsActive(
  electionId: string,
  electionVoterId: string,
  sessionId: string,
  now = new Date()
) {
  const session = await prisma.electionSession.findFirst({
    where: {
      id: sessionId,
      electionId,
      electionVoterId
    },
    select: {
      id: true,
      revokedAt: true,
      expiresAt: true
    }
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
    throw new AppError("Election session is invalid or expired.", 401);
  }

  return session;
}

function buildReceiptReference() {
  return `RCPT-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
}

function canViewResultsAsPublic(electionStatus: ElectionStatus, mode: ElectionResultsVisibility) {
  return (
    mode === ElectionResultsVisibility.PUBLIC_AFTER_CLOSE &&
    (electionStatus === ElectionStatus.CLOSED || electionStatus === ElectionStatus.ARCHIVED)
  );
}

async function resolveResultViewerAccess(input: {
  organizationId: string;
  electionId: string;
  electionStatus: ElectionStatus;
  resultsVisibilityMode: ElectionResultsVisibility;
  principal: AuthPrincipal;
  membershipRole?: string;
}) {
  if (input.principal.tokenType === "election_voter") {
    throw new AppError("Election results are only visible to authorized manager/chair/observer roles.", 403);
  }

  const isManager =
    input.principal.role === UserRole.SUPER_ADMIN ||
    managerRoles.has((input.membershipRole as MembershipRole | undefined) ?? MembershipRole.MEMBER);

  const assignment = await prisma.electionAccessAssignment.findFirst({
    where: {
      electionId: input.electionId,
      userId: input.principal.sub
    },
    select: {
      role: true
    }
  });

  if (input.electionStatus === ElectionStatus.CLOSED || input.electionStatus === ElectionStatus.ARCHIVED) {
    if (isManager || assignment?.role === ElectionAccessRole.CHAIR || assignment?.role === ElectionAccessRole.OBSERVER) {
      return;
    }

    throw new AppError("Election results are not available for this account.", 403);
  }

  if (input.electionStatus !== ElectionStatus.OPEN) {
    throw new AppError("Election results are not available in this election state.", 403);
  }

  switch (input.resultsVisibilityMode) {
    case ElectionResultsVisibility.NONE_DURING_OPEN:
      throw new AppError("Live results are disabled for this election.", 403);
    case ElectionResultsVisibility.ORG_MANAGERS_DURING_OPEN:
      if (!isManager) {
        throw new AppError("Live results are limited to organization managers.", 403);
      }
      return;
    case ElectionResultsVisibility.CHAIR_ONLY_DURING_OPEN:
      if (assignment?.role !== ElectionAccessRole.CHAIR) {
        throw new AppError("Live results are limited to the election chair.", 403);
      }
      return;
    case ElectionResultsVisibility.CHAIR_AND_OBSERVERS_DURING_OPEN:
      if (
        assignment?.role !== ElectionAccessRole.CHAIR &&
        assignment?.role !== ElectionAccessRole.OBSERVER
      ) {
        throw new AppError("Live results are limited to election chair/observer assignments.", 403);
      }
      return;
    case ElectionResultsVisibility.PUBLIC_AFTER_CLOSE:
      throw new AppError("Live results are disabled for this election.", 403);
    default:
      throw new AppError("Live result policy is not recognized.", 403);
  }
}

function mapTallies(
  election: {
    id: string;
    title: string;
    status: ElectionStatus;
    offices: Array<{
      id: string;
      title: string;
      seats: number;
      candidates: Array<{
        id: string;
        displayName: string;
      }>;
    }>;
  },
  groupedVotes: Array<{
    officeId: string;
    candidateId: string;
    _count: {
      candidateId: number;
    };
  }>
) {
  const voteCountMap = new Map<string, number>();

  for (const record of groupedVotes) {
    voteCountMap.set(`${record.officeId}:${record.candidateId}`, record._count.candidateId);
  }

  const offices = election.offices.map((office) => ({
    officeId: office.id,
    title: office.title,
    seats: office.seats,
    totalVotes: office.candidates.reduce((sum, candidate) => {
      return sum + (voteCountMap.get(`${office.id}:${candidate.id}`) ?? 0);
    }, 0),
    candidates: office.candidates.map((candidate) => ({
      candidateId: candidate.id,
      displayName: candidate.displayName,
      votes: voteCountMap.get(`${office.id}:${candidate.id}`) ?? 0
    }))
  }));

  return {
    election: {
      id: election.id,
      title: election.title,
      status: election.status
    },
    offices
  };
}

export async function getBallotForElection(
  organizationId: string,
  electionId: string,
  principal: AuthPrincipal
) {
  const election = await getElectionOrThrow(organizationId, electionId);
  const { electionVoterId, electionSessionId } = assertElectionVoterPrincipal(principal, electionId);
  await getElectionVoterOrThrow(organizationId, electionId, electionVoterId);
  await assertSessionIsActive(electionId, electionVoterId, electionSessionId);

  const existingBallot = await prisma.ballot.findUnique({
    where: {
      electionId_electionVoterId: {
        electionId,
        electionVoterId
      }
    },
    include: {
      votes: true
    }
  });

  return {
    election: {
      id: election.id,
      title: election.title,
      description: election.description,
      status: election.status,
      startsAt: election.startsAt,
      endsAt: election.endsAt
    },
    offices: election.offices,
    ballot: existingBallot
  };
}

export async function submitBallot(
  organizationId: string,
  electionId: string,
  principal: AuthPrincipal,
  input: SubmitBallotInput,
  auditContext?: AuditRequestContext
) {
  const election = await getElectionOrThrow(organizationId, electionId);
  const { electionVoterId, electionSessionId } = assertElectionVoterPrincipal(principal, electionId);
  const voter = await getElectionVoterOrThrow(organizationId, electionId, electionVoterId);
  await assertSessionIsActive(electionId, electionVoterId, electionSessionId);

  if (!isElectionOpenForVoting(election.status, election.endsAt)) {
    throw new AppError("Voting is only available while the election is open.", 403);
  }

  if (voter.status !== ElectionVoterStatus.CLAIMED) {
    throw new AppError("Only claimed election voter sessions can submit ballots.", 403);
  }

  const existingBallot = await prisma.ballot.findUnique({
    where: {
      electionId_electionVoterId: {
        electionId,
        electionVoterId
      }
    }
  });

  if (existingBallot) {
    throw new AppError("You have already submitted a ballot for this election.", 409);
  }

  const officeMap = new Map(
    election.offices.map((office) => [
      office.id,
      {
        office,
        candidateIds: new Set(office.candidates.map((candidate) => candidate.id))
      }
    ])
  );

  const uniqueOfficeIds = new Set<string>();

  for (const selection of input.selections) {
    if (uniqueOfficeIds.has(selection.officeId)) {
      throw new AppError("Each office can only be selected once in a ballot.", 422);
    }

    uniqueOfficeIds.add(selection.officeId);

    const officeEntry = officeMap.get(selection.officeId);

    if (!officeEntry) {
      throw new AppError("One or more selected offices do not belong to this election.", 422);
    }

    if (!officeEntry.candidateIds.has(selection.candidateId)) {
      throw new AppError("A selected candidate does not belong to the specified office.", 422);
    }
  }

  return prisma.$transaction(async (transaction) => {
    const ballot = await transaction.ballot.create({
      data: {
        electionId,
        electionVoterId,
        submittedSessionId: electionSessionId,
        receiptReference: buildReceiptReference(),
        submittedAt: new Date(),
        votes: {
          create: input.selections.map((selection) => ({
            officeId: selection.officeId,
            candidateId: selection.candidateId
          }))
        }
      },
      include: {
        votes: true
      }
    });

    await transaction.electionVoter.update({
      where: { id: voter.id },
      data: {
        status: ElectionVoterStatus.VOTED,
        votedAt: ballot.submittedAt
      }
    });

    await recordAuditLog(
      {
        organizationId,
        electionId,
        actorElectionVoterId: electionVoterId,
        action: "ballot.submitted",
        targetType: "ballot",
        targetId: ballot.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          selectionCount: input.selections.length,
          receiptReference: ballot.receiptReference,
          submittedSessionId: electionSessionId
        }
      },
      transaction
    );

    return ballot;
  });
}

export async function getElectionResultsForViewer(input: {
  organizationId: string;
  electionId: string;
  principal: AuthPrincipal;
  membershipRole?: string;
}) {
  const election = await getElectionOrThrow(input.organizationId, input.electionId);

  await resolveResultViewerAccess({
    organizationId: input.organizationId,
    electionId: input.electionId,
    electionStatus: election.status,
    resultsVisibilityMode: election.resultsVisibilityMode,
    principal: input.principal,
    membershipRole: input.membershipRole
  });

  const groupedVotes = await prisma.vote.groupBy({
    by: ["officeId", "candidateId"],
    where: {
      ballot: {
        electionId: input.electionId
      }
    },
    _count: {
      candidateId: true
    }
  });

  return mapTallies(election, groupedVotes);
}

export async function getPublicElectionResults(electionSlug: string) {
  const election = await getElectionByPublicSlugOrThrow(electionSlug);

  if (!canViewResultsAsPublic(election.status, election.resultsVisibilityMode)) {
    throw new AppError("Public election results are not available for this election yet.", 403);
  }

  const groupedVotes = await prisma.vote.groupBy({
    by: ["officeId", "candidateId"],
    where: {
      ballot: {
        electionId: election.id
      }
    },
    _count: {
      candidateId: true
    }
  });

  return mapTallies(election, groupedVotes);
}
