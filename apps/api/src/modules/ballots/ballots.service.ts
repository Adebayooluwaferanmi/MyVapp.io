import { ElectionStatus } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import type { SubmitBallotInput } from "./ballots.schemas";

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

export async function getBallotForElection(
  organizationId: string,
  electionId: string,
  voterId: string
) {
  const election = await getElectionOrThrow(organizationId, electionId);
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
  input: SubmitBallotInput
) {
  const election = await getElectionOrThrow(organizationId, electionId);

  if (election.status !== ElectionStatus.OPEN) {
    throw new AppError("Voting is only allowed when the election is open.", 409);
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

    return ballot;
  });
}

export async function getElectionResults(organizationId: string, electionId: string) {
  const election = await getElectionOrThrow(organizationId, electionId);

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
