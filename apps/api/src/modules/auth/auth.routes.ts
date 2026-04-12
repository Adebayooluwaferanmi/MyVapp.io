import { Router } from "express";

import { env } from "../../config/env";
import { requireAuth } from "../../middlewares/auth.middleware";
import { createRateLimiter } from "../../middlewares/rate-limit.middleware";
import { login, me, register } from "./auth.controller";

const authRouter = Router();
const authRateLimiter = createRateLimiter({
  keyPrefix: "auth",
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  message: "Too many authentication attempts. Please wait and try again.",
  getKey(request) {
    const email =
      typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "anonymous";
    const forwardedFor = request.headers["x-forwarded-for"];
    const forwardedIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(",")[0]?.trim();
    const ip = forwardedIp || request.ip || request.socket.remoteAddress || "unknown";

    return `${ip}:${email}`;
  }
});

authRouter.post("/register", authRateLimiter, register);
authRouter.post("/login", authRateLimiter, login);
authRouter.get("/me", requireAuth, me);

export { authRouter };
