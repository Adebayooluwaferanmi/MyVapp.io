import { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import type {
  CommitElectionEligibilityImportInput,
  ListElectionEligibilityQuery,
  PreviewElectionEligibilityImportInput,
  PublicElectionClaimInput,
  SendElectionInvitationsInput
} from "./eligibility.schemas";

async function getElectionWithOrganizationOrThrow(organizationId: string, electionId: string) {
  const election = await prisma.election.findFirst({
    where: {
      id: electionId,
      organizationId
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      },
      _count: {
        select: {
          ballots: true,
          eligibilities: true
        }
      }
    }
  });

  if (!election) {
    throw new AppError("Election not found in this organization.", 404);
  }

  return election;
}

function summarizeEligibilityRoster(
  eligibilities: Array<{
    status: string;
    invites: Array<{
      sentAt: Date | null;
      usedAt: Date | null;
      revokedAt: Date | null;
    }>;
  }>,
  ballotsSubmitted: number
) {
  return eligibilities.reduce(
    (summary, eligibility) => {
      summary.importedEligibleCount += 1;

      const latestInvite = eligibility.invites[0];

      if (latestInvite?.sentAt) {
        summary.invitesSentCount += 1;
      }

      if (eligibility.status === "CLAIMED" || eligibility.status === "VOTED") {
        summary.claimedCount += 1;
      }

      if (eligibility.status === "REVOKED") {
        summary.revokedCount += 1;
      }

      if (eligibility.status === "EXPIRED") {
        summary.expiredCount += 1;
      }

      if (latestInvite?.usedAt) {
        summary.usedInviteCount += 1;
      }

      return summary;
    },
    {
      importedEligibleCount: 0,
      invitesSentCount: 0,
      claimedCount: 0,
      revokedCount: 0,
      expiredCount: 0,
      usedInviteCount: 0,
      ballotsSubmitted
    }
  );
}

export async function listElectionEligibilityRoster(
  organizationId: string,
  electionId: string,
  query: ListElectionEligibilityQuery
) {
  const election = await getElectionWithOrganizationOrThrow(organizationId, electionId);

  const eligibilityWhere: Prisma.ElectionEligibilityWhereInput = {
    electionId,
    ...(query.status ? { status: query.status } : {})
  };

  const eligibilities = await prisma.electionEligibility.findMany({
    where: eligibilityWhere,
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" }
    ],
    include: {
      claimedBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      },
      importJob: {
        select: {
          id: true,
          filename: true,
          sourceFormat: true,
          committedAt: true,
          createdAt: true
        }
      },
      invites: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  return {
    election: {
      id: election.id,
      title: election.title,
      slug: election.slug,
      publicSlug: election.publicSlug,
      status: election.status,
      startsAt: election.startsAt,
      endsAt: election.endsAt,
      organization: election.organization
    },
    summary: summarizeEligibilityRoster(eligibilities, election._count.ballots),
    eligibilities: eligibilities.map((eligibility) => ({
      id: eligibility.id,
      memberUniqueId: eligibility.memberUniqueId,
      fullName: eligibility.fullName,
      age: eligibility.age,
      email: eligibility.email,
      status: eligibility.status,
      claimedAt: eligibility.claimedAt,
      votedAt: eligibility.votedAt,
      createdAt: eligibility.createdAt,
      importJob: eligibility.importJob,
      claimedBy: eligibility.claimedBy,
      latestInvite:
        eligibility.invites[0] === undefined
          ? null
          : {
              id: eligibility.invites[0].id,
              expiresAt: eligibility.invites[0].expiresAt,
              sentAt: eligibility.invites[0].sentAt,
              usedAt: eligibility.invites[0].usedAt,
              revokedAt: eligibility.invites[0].revokedAt,
              createdAt: eligibility.invites[0].createdAt
            }
    }))
  };
}

export async function previewElectionEligibilityImport(
  organizationId: string,
  electionId: string,
  _input: PreviewElectionEligibilityImportInput,
  _actorUserId: string
) {
  await getElectionWithOrganizationOrThrow(organizationId, electionId);

  throw new AppError(
    "Eligibility import preview is not implemented yet. Milestone 2 will add CSV/XLSX parsing and row validation.",
    501
  );
}

export async function commitElectionEligibilityImport(
  organizationId: string,
  electionId: string,
  _importId: string,
  _input: CommitElectionEligibilityImportInput,
  _actorUserId: string
) {
  await getElectionWithOrganizationOrThrow(organizationId, electionId);

  throw new AppError(
    "Eligibility import commit is not implemented yet. Milestone 2 will persist validated registry rows.",
    501
  );
}

export async function sendElectionInvitations(
  organizationId: string,
  electionId: string,
  _input: SendElectionInvitationsInput,
  _actorUserId: string
) {
  await getElectionWithOrganizationOrThrow(organizationId, electionId);

  throw new AppError(
    "Election invitation delivery is not implemented yet. Milestone 2 will add SMTP-backed invite delivery.",
    501
  );
}

export async function resendElectionInvitation(
  organizationId: string,
  electionId: string,
  _eligibilityId: string,
  _actorUserId: string
) {
  await getElectionWithOrganizationOrThrow(organizationId, electionId);

  throw new AppError(
    "Election invitation resend is not implemented yet. Milestone 2 will add SMTP-backed resend support.",
    501
  );
}

export async function getPublicElectionClaimContext(electionSlug: string, _token: string) {
  const election = await prisma.election.findUnique({
    where: {
      publicSlug: electionSlug
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });

  if (!election) {
    throw new AppError("Election claim link not found.", 404);
  }

  throw new AppError(
    "Public election claim is not implemented yet. Milestone 3 will add token validation and voter account claim.",
    501
  );
}

export async function claimPublicElectionInvite(
  electionSlug: string,
  _input: PublicElectionClaimInput
) {
  const election = await prisma.election.findUnique({
    where: {
      publicSlug: electionSlug
    }
  });

  if (!election) {
    throw new AppError("Election claim link not found.", 404);
  }

  throw new AppError(
    "Public election claim is not implemented yet. Milestone 3 will create or link voter accounts after invite verification.",
    501
  );
}
