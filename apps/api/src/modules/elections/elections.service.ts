import { ElectionStatus, MembershipRole, UserRole } from "@prisma/client";

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

const managerRoles = new Set<MembershipRole>([MembershipRole.OWNER, MembershipRole.ADMIN]);

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

  while (await prisma.election.findUnique({ where: { publicSlug } })) {
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

function assertElectionStructureMutable(election: {
  status: ElectionStatus;
  lockAfterOpen: boolean;
}) {
  if (election.status === ElectionStatus.OPEN && election.lockAfterOpen) {
    throw new AppError(
      "Election structure is locked after opening. Offices and candidates cannot be changed.",
      409
    );
  }

  if (election.status === ElectionStatus.CLOSED || election.status === ElectionStatus.ARCHIVED) {
    throw new AppError("Election structure cannot be modified after closing.", 409);
  }
}

async function ensureOfficeInElection(organizationId: string, electionId: string, officeId: string) {
  const office = await prisma.office.findFirst({
    where: {
      id: officeId,
      electionId,
      election: {
        organizationId
      }
    },
    include: {
      election: {
        select: {
          status: true,
          lockAfterOpen: true
        }
      }
    }
  });

  if (!office) {
    throw new AppError("Office not found in this election.", 404);
  }

  assertElectionStructureMutable(office.election);

  return office;
}

export async function listOrganizationElections(organizationId: string) {
  return prisma.election.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      _count: {
        select: {
          offices: true,
          ballots: true,
          voters: true
        }
      }
    }
  });
}

function canManageOrganization(platformRole: string | undefined, membershipRole: string | undefined) {
  return (
    platformRole === UserRole.SUPER_ADMIN ||
    managerRoles.has((membershipRole as MembershipRole | undefined) ?? MembershipRole.MEMBER)
  );
}

export async function listOrganizationElectionsForUser(input: {
  organizationId: string;
  userId: string;
  platformRole?: string;
  membershipRole?: string;
}) {
  if (canManageOrganization(input.platformRole, input.membershipRole)) {
    return listOrganizationElections(input.organizationId);
  }

  return prisma.election.findMany({
    where: {
      organizationId: input.organizationId,
      accessAssignments: {
        some: {
          userId: input.userId
        }
      }
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      _count: {
        select: {
          offices: true,
          ballots: true,
          voters: true
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
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        resultsVisibilityMode: input.resultsVisibilityMode ?? "NONE_DURING_OPEN",
        lockAfterOpen: input.lockAfterOpen ?? true,
        invalidatePriorSessionOnNewLogin: input.invalidatePriorSessionOnNewLogin ?? false
      }
    });

    await recordAuditLog(
      {
        organizationId,
        electionId: election.id,
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
          endsAt: election.endsAt?.toISOString() ?? null,
          resultsVisibilityMode: election.resultsVisibilityMode,
          lockAfterOpen: election.lockAfterOpen,
          invalidatePriorSessionOnNewLogin: election.invalidatePriorSessionOnNewLogin
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
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
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
          ballots: true,
          voters: true,
          accessAssignments: true
        }
      }
    }
  });

  if (!election) {
    throw new AppError("Election not found in this organization.", 404);
  }

  return election;
}

export async function getElectionDetailsForUser(input: {
  organizationId: string;
  electionId: string;
  userId: string;
  platformRole?: string;
  membershipRole?: string;
}) {
  if (canManageOrganization(input.platformRole, input.membershipRole)) {
    return getElectionDetails(input.organizationId, input.electionId);
  }

  const election = await prisma.election.findFirst({
    where: {
      id: input.electionId,
      organizationId: input.organizationId,
      accessAssignments: {
        some: {
          userId: input.userId
        }
      }
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
      _count: {
        select: {
          ballots: true,
          voters: true,
          accessAssignments: true
        }
      }
    }
  });

  if (!election) {
    throw new AppError("You do not have access to this election.", 403);
  }

  return election;
}

function validateStatusTransition(current: ElectionStatus, next: ElectionStatus) {
  if (current === next) {
    return;
  }

  const allowedTransitions: Record<ElectionStatus, ElectionStatus[]> = {
    [ElectionStatus.DRAFT]: [ElectionStatus.READY, ElectionStatus.ARCHIVED],
    [ElectionStatus.READY]: [ElectionStatus.OPEN, ElectionStatus.ARCHIVED],
    [ElectionStatus.OPEN]: [ElectionStatus.CLOSED],
    [ElectionStatus.CLOSED]: [ElectionStatus.ARCHIVED],
    [ElectionStatus.ARCHIVED]: []
  };

  if (!allowedTransitions[current].includes(next)) {
    throw new AppError(`Invalid election status transition: ${current} -> ${next}.`, 409);
  }
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
    validateStatusTransition(election.status, input.status);

    const now = new Date();
    const updatedElection = await transaction.election.update({
      where: { id: electionId },
      data: {
        status: input.status,
        openedAt:
          input.status === ElectionStatus.OPEN
            ? election.openedAt ?? now
            : input.status === ElectionStatus.DRAFT || input.status === ElectionStatus.READY
              ? null
              : election.openedAt,
        closedAt:
          input.status === ElectionStatus.CLOSED || input.status === ElectionStatus.ARCHIVED
            ? election.closedAt ?? now
            : null
      }
    });

    await recordAuditLog(
      {
        organizationId,
        electionId,
        actorUserId,
        action: "election.status_updated",
        targetType: "election",
        targetId: updatedElection.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          title: updatedElection.title,
          previousStatus: election.status,
          nextStatus: updatedElection.status,
          openedAt: updatedElection.openedAt?.toISOString() ?? null,
          closedAt: updatedElection.closedAt?.toISOString() ?? null
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
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
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
  const election = await ensureElectionInOrganization(organizationId, electionId);
  assertElectionStructureMutable(election);

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
        electionId,
        actorUserId,
        action: "election.office_created",
        targetType: "office",
        targetId: office.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
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
    orderBy: [{ createdAt: "asc" }]
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
        electionId,
        actorUserId,
        action: "election.candidate_created",
        targetType: "candidate",
        targetId: candidate.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          officeId,
          displayName: candidate.displayName
        }
      },
      transaction
    );

    return candidate;
  });
}
