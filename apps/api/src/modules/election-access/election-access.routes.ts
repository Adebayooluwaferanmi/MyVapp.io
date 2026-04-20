import { Router } from "express";

import { requireOrganizationManager } from "../../middlewares/organization.middleware";
import {
  deleteElectionAccessAssignment,
  getElectionAccessAssignments,
  postElectionAccessAssignment
} from "./election-access.controller";

const electionAccessAdminRouter = Router({ mergeParams: true });

electionAccessAdminRouter.get("/access-assignments", requireOrganizationManager, getElectionAccessAssignments);
electionAccessAdminRouter.post("/access-assignments", requireOrganizationManager, postElectionAccessAssignment);
electionAccessAdminRouter.delete(
  "/access-assignments/:assignmentId",
  requireOrganizationManager,
  deleteElectionAccessAssignment
);

export { electionAccessAdminRouter };
