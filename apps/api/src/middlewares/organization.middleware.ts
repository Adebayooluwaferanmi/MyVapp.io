import type { NextFunction, Request, Response } from "express";
import { MembershipRole, UserRole } from "@prisma/client";

import { AppError } from "../lib/app-error";
import { prisma } from "../lib/prisma";

const managerRoles = new Set<MembershipRole>([MembershipRole.OWNER, MembershipRole.ADMIN]);
const ballotEligibleRoles = new Set<MembershipRole>([
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.VOTER
]);

export async function requireOrganizationMember(
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> {
  const organizationId = request.params.organizationId;
  const userId = request.user?.sub;
  const platformRole = request.user?.role as UserRole | undefined;

  if (!organizationId || !userId) {
    next(new AppError("Organization access context is missing.", 400));
    return;
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true }
  });

  if (!organization) {
    next(new AppError("Organization not found.", 404));
    return;
  }

  if (platformRole === UserRole.SUPER_ADMIN) {
    request.membership = {
      organizationId,
      role: MembershipRole.OWNER
    };
    next();
    return;
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId,
        userId
      }
    }
  });

  if (!membership) {
    next(new AppError("You are not a member of this organization.", 403));
    return;
  }

  request.membership = {
    organizationId,
    role: membership.role
  };

  next();
}

export function requireOrganizationManager(
  request: Request,
  _response: Response,
  next: NextFunction
): void {
  if (!request.membership) {
    next(new AppError("Organization membership has not been loaded.", 500));
    return;
  }

  if (!managerRoles.has(request.membership.role as MembershipRole)) {
    next(new AppError("Only organization managers can perform this action.", 403));
    return;
  }

  next();
}

export function requireOrganizationEligibleVoter(
  request: Request,
  _response: Response,
  next: NextFunction
): void {
  if (!request.membership) {
    next(new AppError("Organization membership has not been loaded.", 500));
    return;
  }

  if (!ballotEligibleRoles.has(request.membership.role as MembershipRole)) {
    next(new AppError("Only eligible voters can access or submit ballots in this organization.", 403));
    return;
  }

  next();
}
