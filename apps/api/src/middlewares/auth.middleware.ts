import type { NextFunction, Request, Response } from "express";

import { AppError } from "../lib/app-error";
import { verifyAuthToken } from "../lib/jwt";

export function requireAuth(request: Request, _response: Response, next: NextFunction): void {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    next(new AppError("Authentication token is missing.", 401));
    return;
  }

  const token = authorization.replace("Bearer ", "").trim();

  try {
    request.user = verifyAuthToken(token);
    next();
  } catch {
    next(new AppError("Authentication token is invalid or expired.", 401));
  }
}
