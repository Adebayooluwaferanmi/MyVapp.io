import { Router } from "express";

import { getPublicClaimContext, postPublicClaim } from "./eligibility.controller";

const eligibilityPublicRouter = Router();

eligibilityPublicRouter.get("/:electionSlug/claim-context", getPublicClaimContext);
eligibilityPublicRouter.post("/:electionSlug/claim", postPublicClaim);

export { eligibilityPublicRouter };
