import { Router } from "express";

import { requireAuth } from "../../middlewares/auth.middleware";
import {
  loadOrganizationAccessContext,
  requireOrganizationManager,
  requireOrganizationMember
} from "../../middlewares/organization.middleware";
import { getOrganizationAuditLogs } from "../audit/audit.controller";
import { electionsRouter } from "../elections/elections.routes";
import {
  createOrganization,
  createOrganizationMember,
  getOrganization,
  getOrganizationMembers,
  listOrganizations,
  patchOrganizationTheme,
  patchOrganizationMemberRole
} from "./organizations.controller";

const organizationsRouter = Router();

organizationsRouter.use(requireAuth);

organizationsRouter.get("/", listOrganizations);
organizationsRouter.post("/", createOrganization);

organizationsRouter.use("/:organizationId/elections", loadOrganizationAccessContext, electionsRouter);

organizationsRouter.get("/:organizationId", requireOrganizationMember, getOrganization);
organizationsRouter.patch(
  "/:organizationId/theme",
  loadOrganizationAccessContext,
  requireOrganizationManager,
  patchOrganizationTheme
);
organizationsRouter.get(
  "/:organizationId/members",
  loadOrganizationAccessContext,
  requireOrganizationManager,
  getOrganizationMembers
);
organizationsRouter.post(
  "/:organizationId/members",
  loadOrganizationAccessContext,
  requireOrganizationManager,
  createOrganizationMember
);
organizationsRouter.patch(
  "/:organizationId/members/:memberId",
  loadOrganizationAccessContext,
  requireOrganizationManager,
  patchOrganizationMemberRole
);
organizationsRouter.get(
  "/:organizationId/audit-logs",
  loadOrganizationAccessContext,
  requireOrganizationManager,
  getOrganizationAuditLogs
);

export { organizationsRouter };
