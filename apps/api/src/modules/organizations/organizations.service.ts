import crypto from "node:crypto";

import { MembershipRole, UserRole, UserStatus, type Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { hashPassword } from "../../lib/password";
import { prisma } from "../../lib/prisma";
import type { AuditRequestContext } from "../../lib/request-audit";
import { slugify } from "../../lib/slug";
import { recordAuditLog } from "../audit/audit.service";
import type {
  CreateOrganizationInput,
  CreateOrganizationMemberInput,
  UpdateOrganizationMemberRoleInput
} from "./organizations.schemas";

const managerRoles = new Set<MembershipRole>([MembershipRole.OWNER, MembershipRole.ADMIN]);
const ballotEligibleRoles = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.VOTER
]);

async function buildUniqueOrganizationSlug(name: string): Promise<string> {
  const base = slugify(name) || "organization";
  let slug = base;
  let sequence = 1;

  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${base}-${sequence}`;
    sequence += 1;
  }

  return slug;
}

export async function listOrganizationsForUser(userId: string, platformRole?: string) {
  if (platformRole === UserRole.SUPER_ADMIN) {
    return prisma.organization.findMany({
      orderBy: {
        createdAt: "desc"
      },
      include: {
        _count: {
          select: {
            elections: true,
            members: true
          }
        }
      }
    });
  }

  return prisma.organization.findMany({
    where: {
      members: {
        some: {
          userId
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    include: {
      members: {
        where: { userId },
        select: {
          role: true
        }
      },
      _count: {
        select: {
          elections: true,
          members: true
        }
      }
    }
  });
}

export async function getOrganizationById(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      _count: {
        select: {
          elections: true,
          members: true
        }
      }
    }
  });

  if (!organization) {
    throw new AppError("Organization not found.", 404);
  }

  return organization;
}

export async function createOrganizationForUser(
  userId: string,
  input: CreateOrganizationInput,
  auditContext?: AuditRequestContext
) {
  const slug = await buildUniqueOrganizationSlug(input.name);

  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        slug,
        members: {
          create: {
            userId,
            role: MembershipRole.OWNER
          }
        }
      },
      include: {
        members: {
          where: { userId },
          select: {
            role: true
          }
        }
      }
    });

    await syncUserPlatformRole(userId, transaction);
    await recordAuditLog(
      {
        organizationId: organization.id,
        actorUserId: userId,
        action: "organization.created",
        targetType: "organization",
        targetId: organization.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          name: organization.name,
          slug: organization.slug
        }
      },
      transaction
    );

    return organization;
  });
}

function buildTemporaryPassword(): string {
  return `Mvapp!${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
}

async function syncUserPlatformRole(
  userId: string,
  transaction: Prisma.TransactionClient = prisma
) {
  const user = await transaction.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true
    }
  });

  if (!user || user.role === UserRole.SUPER_ADMIN) {
    return;
  }

  const adminMembership = await transaction.organizationMember.findFirst({
    where: {
      userId,
      role: {
        in: Array.from(managerRoles)
      }
    },
    select: {
      id: true
    }
  });

  const nextRole = adminMembership ? UserRole.ORG_ADMIN : UserRole.VOTER;

  if (user.role !== nextRole) {
    await transaction.user.update({
      where: { id: userId },
      data: { role: nextRole }
    });
  }
}

function mapOrganizationMember(member: {
  id: string;
  organizationId: string;
  role: MembershipRole;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    status: UserStatus;
  };
}) {
  return {
    id: member.id,
    organizationId: member.organizationId,
    role: member.role,
    canVote: ballotEligibleRoles.has(member.role),
    createdAt: member.createdAt,
    user: {
      id: member.user.id,
      email: member.user.email,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      role: member.user.role,
      status: member.user.status
    }
  };
}

export async function listOrganizationMembers(organizationId: string) {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId },
    orderBy: [
      {
        role: "asc"
      },
      {
        createdAt: "asc"
      }
    ],
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          status: true
        }
      }
    }
  });

  return members.map(mapOrganizationMember);
}

export async function addOrganizationMember(
  organizationId: string,
  input: CreateOrganizationMemberInput,
  actorUserId: string,
  auditContext?: AuditRequestContext
) {
  const email = input.email.toLowerCase();

  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true
      }
    });

    if (!organization) {
      throw new AppError("Organization not found.", 404);
    }

    let temporaryPassword: string | null = null;

    const existingUser = await transaction.user.findUnique({
      where: { email }
    });

    if (
      existingUser &&
      (await transaction.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: existingUser.id
          }
        }
      }))
    ) {
      throw new AppError("That user is already a member of this organization.", 409);
    }

    const user =
      existingUser ??
      (await transaction.user.create({
        data: {
          email,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          passwordHash: await hashPassword((temporaryPassword = buildTemporaryPassword())),
          role: managerRoles.has(input.role) ? UserRole.ORG_ADMIN : UserRole.VOTER,
          status: UserStatus.INVITED
        }
      }));

    const membership = await transaction.organizationMember.create({
      data: {
        organizationId,
        userId: user.id,
        role: input.role
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true
          }
        }
      }
    });

    await syncUserPlatformRole(user.id, transaction);
    await recordAuditLog(
      {
        organizationId,
        actorUserId,
        action: "organization.member_added",
        targetType: "organization_member",
        targetId: membership.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          invited: !existingUser,
          memberEmail: membership.user.email,
          memberUserId: membership.user.id,
          organizationRole: membership.role
        }
      },
      transaction
    );

    return {
      member: mapOrganizationMember(membership),
      invited: !existingUser,
      temporaryPassword
    };
  });
}

export async function updateOrganizationMemberRole(
  organizationId: string,
  memberId: string,
  input: UpdateOrganizationMemberRoleInput,
  actorUserId: string,
  auditContext?: AuditRequestContext
) {
  return prisma.$transaction(async (transaction) => {
    const membership = await transaction.organizationMember.findFirst({
      where: {
        id: memberId,
        organizationId
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true
          }
        }
      }
    });

    if (!membership) {
      throw new AppError("Organization member not found.", 404);
    }

    if (membership.role === MembershipRole.OWNER && input.role !== MembershipRole.OWNER) {
      const ownerCount = await transaction.organizationMember.count({
        where: {
          organizationId,
          role: MembershipRole.OWNER
        }
      });

      if (ownerCount <= 1) {
        throw new AppError("An organization must keep at least one owner.", 409);
      }
    }

    const updatedMembership = await transaction.organizationMember.update({
      where: { id: memberId },
      data: {
        role: input.role
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true
          }
        }
      }
    });

    await syncUserPlatformRole(updatedMembership.user.id, transaction);
    await recordAuditLog(
      {
        organizationId,
        actorUserId,
        action: "organization.member_role_updated",
        targetType: "organization_member",
        targetId: updatedMembership.id,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        metadata: {
          memberEmail: updatedMembership.user.email,
          memberUserId: updatedMembership.user.id,
          previousRole: membership.role,
          nextRole: updatedMembership.role
        }
      },
      transaction
    );

    return mapOrganizationMember(updatedMembership);
  });
}
