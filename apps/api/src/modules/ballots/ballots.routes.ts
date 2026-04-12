import { Router } from "express";

import {
  requireOrganizationEligibleVoter,
  requireOrganizationManager
} from "../../middlewares/organization.middleware";
import { getMyBallot, getResults, submitMyBallot } from "./ballots.controller";

const ballotsRouter = Router({ mergeParams: true });

ballotsRouter.get("/ballot", requireOrganizationEligibleVoter, getMyBallot);
ballotsRouter.post("/ballot", requireOrganizationEligibleVoter, submitMyBallot);
ballotsRouter.get("/results", requireOrganizationManager, getResults);

export { ballotsRouter };
