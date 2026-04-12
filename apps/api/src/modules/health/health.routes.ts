import { Router } from "express";

const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.status(200).json({
    status: "ok",
    service: "myvapp-api",
    timestamp: new Date().toISOString()
  });
});

export { healthRouter };
