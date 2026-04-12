import { Router } from "express";

import { authRouter } from "../modules/auth/auth.routes";
import { organizationsRouter } from "../modules/organizations/organizations.routes";
import { healthRouter } from "../modules/health/health.routes";

const apiRouter = Router();

apiRouter.get("/", (_request, response) => {
  response.json({
    name: "MyVapp API",
    version: "0.1.0",
    message: "Voting platform API for organizations, groups, and communities."
  });
});

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/organizations", organizationsRouter);

export { apiRouter };
