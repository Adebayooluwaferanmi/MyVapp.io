import { Router } from "express";

import { getPublicClaimContext, postPublicClaim } from "./election-access.public.controller";

const electionAccessPublicRouter = Router();

electionAccessPublicRouter.get("/:electionSlug/claim-context", getPublicClaimContext);
electionAccessPublicRouter.post("/:electionSlug/claim", postPublicClaim);

export { electionAccessPublicRouter };
