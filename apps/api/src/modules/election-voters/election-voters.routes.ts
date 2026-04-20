import { Router } from "express";

import { requireOrganizationManager } from "../../middlewares/organization.middleware";
import {
  getElectionVoters,
  postElectionVoterImportCommit,
  postElectionVoterImportPreview
} from "./election-voters.controller";

const electionVotersAdminRouter = Router({ mergeParams: true });

electionVotersAdminRouter.get("/voters", requireOrganizationManager, getElectionVoters);
electionVotersAdminRouter.post(
  "/voter-imports/preview",
  requireOrganizationManager,
  postElectionVoterImportPreview
);
electionVotersAdminRouter.post(
  "/voter-imports/:importId/commit",
  requireOrganizationManager,
  postElectionVoterImportCommit
);

export { electionVotersAdminRouter };
