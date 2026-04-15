import { Router } from "express";

import { env } from "../../config/env";
import { createRateLimiter } from "../../middlewares/rate-limit.middleware";
import {
  requireOrganizationEligibleVoter,
  requireOrganizationManager
} from "../../middlewares/organization.middleware";
import { getMyBallot, getResults, submitMyBallot } from "./ballots.controller";

const ballotsRouter = Router({ mergeParams: true });
const ballotRateLimiter = createRateLimiter({
  keyPrefix: "ballot",
  windowMs: env.BALLOT_RATE_LIMIT_WINDOW_MS,
  max: env.BALLOT_RATE_LIMIT_MAX,
  message: "Too many ballot requests. Please slow down and try again.",
  getKey(request) {
    const forwardedFor = request.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(",")[0]?.trim();
    const ip = forwardedIp || request.ip || request.socket.remoteAddress || "unknown";
    const userId = request.user?.sub ?? "anonymous";

    return `${ip}:${userId}:${request.params.organizationId}:${request.params.electionId}`;
  }
});

ballotsRouter.get("/ballot", ballotRateLimiter, requireOrganizationEligibleVoter, getMyBallot);
ballotsRouter.post("/ballot", ballotRateLimiter, requireOrganizationEligibleVoter, submitMyBallot);
ballotsRouter.get("/results", requireOrganizationManager, getResults);

export { ballotsRouter };
