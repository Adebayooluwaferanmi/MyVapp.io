import { Router } from "express";

import { requireOrganizationManager } from "../../middlewares/organization.middleware";
import {
  postElectionInviteResend,
  postElectionInviteRevoke,
  postElectionInvitesPreview,
  postElectionInvitesSend
} from "./election-invites.controller";

const electionInvitesAdminRouter = Router({ mergeParams: true });

electionInvitesAdminRouter.post("/invitations/preview", requireOrganizationManager, postElectionInvitesPreview);
electionInvitesAdminRouter.post("/invitations/send", requireOrganizationManager, postElectionInvitesSend);
electionInvitesAdminRouter.post(
  "/invitations/:electionVoterId/resend",
  requireOrganizationManager,
  postElectionInviteResend
);
electionInvitesAdminRouter.post(
  "/invitations/:electionVoterId/revoke-unused",
  requireOrganizationManager,
  postElectionInviteRevoke
);

// Backward-compatible alias for old eligibility-based route parameter naming.
electionInvitesAdminRouter.post(
  "/invitations/:eligibilityId/resend",
  requireOrganizationManager,
  (request, response, next) => {
    request.params.electionVoterId = request.params.eligibilityId;
    void postElectionInviteResend(request, response).catch(next);
  }
);

export { electionInvitesAdminRouter };
