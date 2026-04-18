import { ElectionEligibilityStatus, MembershipRole, UserRole } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import type { AuditRequestContext } from "../../lib/request-audit";
import { recordAuditLog } from "../audit/audit.service";
import {
  canUseElectionEligibilityForBallot,
  canViewElectionResults
} from "../eligibility/eligibility.policy";
import type { SubmitBallotInput } from "./ballots.schemas";

const managerRoles = new Set<MembershipRole>([MembershipRole.OWNER, MembershipRole.ADMIN]);

async function getElectionOrThrow(organizationId: string, electionId: string) {
  const election = await prisma.election.findFirst({
    where: {
      id: electionId,
      organizationId
    },
    include: {
      offices: {
        orderBy: [
          {
            sortOrder: "asc"
          },
          {
            createdAt: "asc"
          }
        ],
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
        orderBy: [
          {
            sortOrder: "asc"
          },
          {
            createdAt: "asc"
          }
        ],
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

async function getElectionEligibilityForUserOrThrow(
  organizationId: string,
  electionId: string,
  userId: string
) {
  const eligibility = await prisma.electionEligibility.findFirst({
    where: {
      electionId,
      claimedByUserId: userId,
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

  if (!eligibility) {
    throw new AppError("You do not have election access for this ballot.", 403);
  }

  if (
    eligibility.status === ElectionEligibilityStatus.REVOKED ||
    eligibility.status === ElectionEligibilityStatus.EXPIRED
  ) {
    throw new AppError("Your election access is no longer active.", 403);
  }

  return eligibility;
}

export async function getBallotForElection(
  organizationId: string,
  electionId: string,
  voterId: string
) {
  const election = await getElectionOrThrow(organizationId, electionId);
  await getElectionEligibilityForUserOrThrow(organizationId, electionId, voterId);
  const existingBallot = await prisma.ballot.findUnique({
    where: {
      electionId_voterId: {
        electionId,
        voterId
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
  voterId: string,
  input: SubmitBallotInput,
  auditContext?: AuditRequestContext
) {
  const election = await getElectionOrThrow(organizationId, electionId);
  const eligibility = await getElectionEligibilityForUserOrThrow(organizationId, electionId, voterId);

  if (
    !canUseElectionEligibilityForBallot({
      eligibilityStatus: eligibility.status,
      electionStatus: election.status,
      electionEndsAt: election.endsAt
    })
  ) {
    throw new AppError("Voting is only available for claimed voter access while the election is open.", 403);
  }

  const existingBallot = await prisma.ballot.findUnique({
    where: {
      electionId_voterId: {
        electionId,
        voterId
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
        voterId,
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

    await transaction.electionEligibility.update({
      where: { id: eligibility.id },
      data: {
        status: ElectionEligibilityStatus.VOTED,
        votedAt: ballot.submittedAt
      }
    });

    await recordAuditLog(
      {
        organizationId,
        actorUserId: voterId,
        action: "ballot.submitted",
        targetType: "ballot",
        targetId: ballot.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          electionId,
          selectionCount: input.selections.length
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
  userId: string;
  platformRole?: string;
  membershipRole?: string;
}) {
  const election = await getElectionOrThrow(input.organizationId, input.electionId);
  const isManager =
    input.platformRole === UserRole.SUPER_ADMIN ||
    managerRoles.has((input.membershipRole as MembershipRole | undefined) ?? MembershipRole.MEMBER);

  if (isManager) {
    if (!canViewElectionResults("manager", election.status)) {
      throw new AppError(
        "Candidate tallies are available after the election closes. Use the voter registry summary to track turnout while voting is open.",
        403
      );
    }
  } else {
    const eligibility = await getElectionEligibilityForUserOrThrow(
      input.organizationId,
      input.electionId,
      input.userId
    );

    if (
      !canViewElectionResults("voter", election.status) ||
      (eligibility.status !== ElectionEligibilityStatus.CLAIMED &&
        eligibility.status !== ElectionEligibilityStatus.VOTED)
    ) {
      throw new AppError("Election results will be available here after voting closes.", 403);
    }
  }

  const groupedVotes = await prisma.vote.groupBy({
    by: ["officeId", "candidateId"],
    where: {
      ballot: {
        electionId
      }
    },
    _count: {
      candidateId: true
    }
  });

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

export async function getPublicElectionResults(electionSlug: string) {
  const election = await getElectionByPublicSlugOrThrow(electionSlug);

  if (!canViewElectionResults("public", election.status)) {
    throw new AppError("Election results will be available here after voting closes.", 403);
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
