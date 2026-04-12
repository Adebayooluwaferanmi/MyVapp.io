import { Router } from "express";

import { requireAuth } from "../../middlewares/auth.middleware";
import {
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
  patchOrganizationMemberRole
} from "./organizations.controller";

const organizationsRouter = Router();

organizationsRouter.use(requireAuth);

organizationsRouter.get("/", listOrganizations);
organizationsRouter.post("/", createOrganization);

organizationsRouter.use("/:organizationId/elections", requireOrganizationMember, electionsRouter);

organizationsRouter.get("/:organizationId", requireOrganizationMember, getOrganization);
organizationsRouter.get(
  "/:organizationId/members",
  requireOrganizationMember,
  requireOrganizationManager,
  getOrganizationMembers
);
organizationsRouter.post(
  "/:organizationId/members",
  requireOrganizationMember,
  requireOrganizationManager,
  createOrganizationMember
);
organizationsRouter.patch(
  "/:organizationId/members/:memberId",
  requireOrganizationMember,
  requireOrganizationManager,
  patchOrganizationMemberRole
);
organizationsRouter.get(
  "/:organizationId/audit-logs",
  requireOrganizationMember,
  requireOrganizationManager,
  getOrganizationAuditLogs
);

export { organizationsRouter };
