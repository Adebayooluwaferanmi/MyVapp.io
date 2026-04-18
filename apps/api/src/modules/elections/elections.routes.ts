import { Router } from "express";

import { ballotsRouter } from "../ballots/ballots.routes";
import { eligibilityAdminRouter } from "../eligibility/eligibility.routes";
import {
  requireOrganizationManager,
  requireOrganizationMember
} from "../../middlewares/organization.middleware";
import {
  createCandidateForOffice,
  createElectionForOrganization,
  createOfficeForElection,
  getElection,
  listCandidates,
  listElections,
  listOffices,
  updateElectionStatusForOrganization
} from "./elections.controller";

const electionsRouter = Router({ mergeParams: true });

electionsRouter.get("/", listElections);
electionsRouter.post("/", requireOrganizationManager, createElectionForOrganization);

electionsRouter.get("/:electionId", requireOrganizationMember, getElection);
electionsRouter.patch(
  "/:electionId/status",
  requireOrganizationManager,
  updateElectionStatusForOrganization
);
electionsRouter.use("/:electionId", eligibilityAdminRouter);
electionsRouter.use("/:electionId", ballotsRouter);

electionsRouter.get("/:electionId/offices", requireOrganizationMember, listOffices);
electionsRouter.post("/:electionId/offices", requireOrganizationManager, createOfficeForElection);

electionsRouter.get("/:electionId/offices/:officeId/candidates", requireOrganizationMember, listCandidates);
electionsRouter.post(
  "/:electionId/offices/:officeId/candidates",
  requireOrganizationManager,
  createCandidateForOffice
);

export { electionsRouter };
