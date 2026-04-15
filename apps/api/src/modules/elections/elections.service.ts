import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import type { AuditRequestContext } from "../../lib/request-audit";
import { slugify } from "../../lib/slug";
import { recordAuditLog } from "../audit/audit.service";
import type {
  CreateCandidateInput,
  CreateElectionInput,
  CreateOfficeInput,
  UpdateElectionStatusInput
} from "./elections.schemas";

async function buildUniqueElectionSlug(organizationId: string, title: string): Promise<string> {
  const base = slugify(title) || "election";
  let slug = base;
  let sequence = 1;

  while (
    await prisma.election.findUnique({
      where: {
        organizationId_slug: {
          organizationId,
          slug
        }
      }
    })
  ) {
    slug = `${base}-${sequence}`;
    sequence += 1;
  }

  return slug;
}

async function buildUniquePublicElectionSlug(title: string): Promise<string> {
  const base = slugify(title) || "election";
  let publicSlug = base;
  let sequence = 1;

  while (
    await prisma.election.findUnique({
      where: {
        publicSlug
      }
    })
  ) {
    publicSlug = `${base}-${sequence}`;
    sequence += 1;
  }

  return publicSlug;
}

async function ensureElectionInOrganization(organizationId: string, electionId: string) {
  const election = await prisma.election.findFirst({
    where: {
      id: electionId,
      organizationId
    }
  });

  if (!election) {
    throw new AppError("Election not found in this organization.", 404);
  }

  return election;
}

async function ensureOfficeInElection(organizationId: string, electionId: string, officeId: string) {
  const office = await prisma.office.findFirst({
    where: {
      id: officeId,
      electionId,
      election: {
        organizationId
      }
    }
  });

  if (!office) {
    throw new AppError("Office not found in this election.", 404);
  }

  return office;
}

export async function listOrganizationElections(organizationId: string) {
  return prisma.election.findMany({
    where: { organizationId },
    orderBy: [
      {
        createdAt: "desc"
      }
    ],
    include: {
      _count: {
        select: {
          offices: true,
          ballots: true
        }
      }
    }
  });
}

export async function createElection(
  organizationId: string,
  input: CreateElectionInput,
  actorUserId: string,
  auditContext?: AuditRequestContext
) {
  const slug = await buildUniqueElectionSlug(organizationId, input.title);
  const publicSlug = await buildUniquePublicElectionSlug(input.title);

  return prisma.$transaction(async (transaction) => {
    const election = await transaction.election.create({
      data: {
        organizationId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        slug,
        publicSlug,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null
      }
    });

    await recordAuditLog(
      {
        organizationId,
        actorUserId,
        action: "election.created",
        targetType: "election",
        targetId: election.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          title: election.title,
          slug: election.slug,
          startsAt: election.startsAt?.toISOString() ?? null,
          endsAt: election.endsAt?.toISOString() ?? null
        }
      },
      transaction
    );

    return election;
  });
}

export async function getElectionDetails(organizationId: string, electionId: string) {
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
      },
      _count: {
        select: {
          ballots: true
        }
      }
    }
  });

  if (!election) {
    throw new AppError("Election not found in this organization.", 404);
  }

  return election;
}

export async function updateElectionStatus(
  organizationId: string,
  electionId: string,
  input: UpdateElectionStatusInput,
  actorUserId: string,
  auditContext?: AuditRequestContext
) {
  return prisma.$transaction(async (transaction) => {
    const election = await ensureElectionInOrganization(organizationId, electionId);
    const updatedElection = await transaction.election.update({
      where: { id: electionId },
      data: {
        status: input.status
      }
    });

    await recordAuditLog(
      {
        organizationId,
        actorUserId,
        action: "election.status_updated",
        targetType: "election",
        targetId: updatedElection.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          title: updatedElection.title,
          previousStatus: election.status,
          nextStatus: updatedElection.status
        }
      },
      transaction
    );

    return updatedElection;
  });
}

export async function listElectionOffices(organizationId: string, electionId: string) {
  await ensureElectionInOrganization(organizationId, electionId);

  return prisma.office.findMany({
    where: { electionId },
    orderBy: [
      {
        sortOrder: "asc"
      },
      {
        createdAt: "asc"
      }
    ],
    include: {
      _count: {
        select: {
          candidates: true,
          votes: true
        }
      }
    }
  });
}

export async function createOffice(
  organizationId: string,
  electionId: string,
  input: CreateOfficeInput,
  actorUserId: string,
  auditContext?: AuditRequestContext
) {
  await ensureElectionInOrganization(organizationId, electionId);

  return prisma.$transaction(async (transaction) => {
    const office = await transaction.office.create({
      data: {
        electionId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        seats: input.seats,
        sortOrder: input.sortOrder
      }
    });

    await recordAuditLog(
      {
        organizationId,
        actorUserId,
        action: "election.office_created",
        targetType: "office",
        targetId: office.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          electionId,
          title: office.title,
          seats: office.seats,
          sortOrder: office.sortOrder
        }
      },
      transaction
    );

    return office;
  });
}

export async function listOfficeCandidates(
  organizationId: string,
  electionId: string,
  officeId: string
) {
  await ensureOfficeInElection(organizationId, electionId, officeId);

  return prisma.candidate.findMany({
    where: {
      officeId
    },
    orderBy: [
      {
        createdAt: "asc"
      }
    ]
  });
}

export async function createCandidate(
  organizationId: string,
  electionId: string,
  officeId: string,
  input: CreateCandidateInput,
  actorUserId: string,
  auditContext?: AuditRequestContext
) {
  await ensureOfficeInElection(organizationId, electionId, officeId);

  return prisma.$transaction(async (transaction) => {
    const candidate = await transaction.candidate.create({
      data: {
        officeId,
        displayName: input.displayName.trim(),
        bio: input.bio?.trim() || null,
        manifesto: input.manifesto?.trim() || null
      }
    });

    await recordAuditLog(
      {
        organizationId,
        actorUserId,
        action: "election.candidate_created",
        targetType: "candidate",
        targetId: candidate.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          electionId,
          officeId,
          displayName: candidate.displayName
        }
      },
      transaction
    );

    return candidate;
  });
}
