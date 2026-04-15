import { Router } from "express";

import { requireOrganizationManager } from "../../middlewares/organization.middleware";
import {
  getElectionEligibility,
  postElectionEligibilityImportCommit,
  postElectionEligibilityImportPreview,
  postElectionInvitationResend,
  postElectionInvitationsSend
} from "./eligibility.controller";

const eligibilityAdminRouter = Router({ mergeParams: true });

eligibilityAdminRouter.get("/eligibility", requireOrganizationManager, getElectionEligibility);
eligibilityAdminRouter.post(
  "/eligibility-imports/preview",
  requireOrganizationManager,
  postElectionEligibilityImportPreview
);
eligibilityAdminRouter.post(
  "/eligibility-imports/:importId/commit",
  requireOrganizationManager,
  postElectionEligibilityImportCommit
);
eligibilityAdminRouter.post(
  "/invitations/send",
  requireOrganizationManager,
  postElectionInvitationsSend
);
eligibilityAdminRouter.post(
  "/invitations/:eligibilityId/resend",
  requireOrganizationManager,
  postElectionInvitationResend
);

export { eligibilityAdminRouter };
