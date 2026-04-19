import { Router } from "express";

import { ballotsRouter } from "../ballots/ballots.routes";
import { electionAccessAdminRouter } from "../election-access/election-access.routes";
import { electionInvitesAdminRouter } from "../election-invites/election-invites.routes";
import { electionVotersAdminRouter } from "../election-voters/election-voters.routes";
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
electionsRouter.use("/:electionId", electionVotersAdminRouter);
electionsRouter.use("/:electionId", electionInvitesAdminRouter);
electionsRouter.use("/:electionId", electionAccessAdminRouter);
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
