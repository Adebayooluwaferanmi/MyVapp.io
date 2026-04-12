import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import { slugify } from "../../lib/slug";
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

export async function createElection(organizationId: string, input: CreateElectionInput) {
  const slug = await buildUniqueElectionSlug(organizationId, input.title);

  return prisma.election.create({
    data: {
      organizationId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      slug,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null
    }
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
  input: UpdateElectionStatusInput
) {
  await ensureElectionInOrganization(organizationId, electionId);

  return prisma.election.update({
    where: { id: electionId },
    data: {
      status: input.status
    }
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
  input: CreateOfficeInput
) {
  await ensureElectionInOrganization(organizationId, electionId);

  return prisma.office.create({
    data: {
      electionId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      seats: input.seats,
      sortOrder: input.sortOrder
    }
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
  input: CreateCandidateInput
) {
  await ensureOfficeInElection(organizationId, electionId, officeId);

  return prisma.candidate.create({
    data: {
      officeId,
      displayName: input.displayName.trim(),
      bio: input.bio?.trim() || null,
      manifesto: input.manifesto?.trim() || null
    }
  });
}
