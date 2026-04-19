import type { NextFunction, Request, Response } from "express";
import { MembershipRole, UserRole } from "@prisma/client";

import { AppError } from "../lib/app-error";
import { prisma } from "../lib/prisma";

const managerRoles = new Set<MembershipRole>([MembershipRole.OWNER, MembershipRole.ADMIN]);

export async function loadOrganizationAccessContext(
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> {
  const organizationId = request.params.organizationId;
  const userId = request.user?.sub;
  const tokenType = request.user?.tokenType;
  const platformRole = request.user?.role as UserRole | undefined;

  if (!organizationId || !userId) {
    next(new AppError("Organization access context is missing.", 400));
    return;
  }

  if (tokenType === "election_voter") {
    request.membership = undefined;
    request.organizationAccess = {
      organizationId,
      exists: true
    };
    next();
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

  request.organizationAccess = {
    organizationId,
    exists: true
  };

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

  request.membership = membership
    ? {
        organizationId,
        role: membership.role
      }
    : undefined;

  next();
}

export async function requireOrganizationMember(
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> {
  await loadOrganizationAccessContext(request, _response, (error?: unknown) => {
    if (error) {
      next(error as Error);
      return;
    }

    if (!request.membership) {
      next(new AppError("You are not a member of this organization.", 403));
      return;
    }

    next();
  });
}

export function requireOrganizationManager(
  request: Request,
  _response: Response,
  next: NextFunction
): void {
  if (!request.membership) {
    next(new AppError("Only organization managers can perform this action.", 403));
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
  if (!request.user) {
    next(new AppError("Authentication token is required.", 401));
    return;
  }

  if (request.user.tokenType === "election_voter") {
    next();
    return;
  }

  if (!request.membership || !managerRoles.has(request.membership.role as MembershipRole)) {
    next(new AppError("Only eligible voters can access or submit ballots in this organization.", 403));
    return;
  }

  next();
}
