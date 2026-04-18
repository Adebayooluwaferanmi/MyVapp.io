import { Router } from "express";

import { getPublicResults } from "./ballots.public.controller";

const ballotsPublicRouter = Router();

ballotsPublicRouter.get("/:electionSlug/results", getPublicResults);

export { ballotsPublicRouter };
