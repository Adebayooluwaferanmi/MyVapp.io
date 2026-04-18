import type { NextFunction, Request, Response } from "express";

import { AppError } from "../lib/app-error";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimiterOptions = {
  keyPrefix: string;
  max: number;
  message: string;
  windowMs: number;
  getKey?: (request: Request) => string;
};

const rateLimitStore = new Map<string, RateLimitEntry>();
let cleanupCounter = 0;

function cleanupExpiredEntries(now: number) {
  cleanupCounter += 1;

  if (cleanupCounter % 50 !== 0) {
    return;
  }

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function defaultRateLimitKey(request: Request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(",")[0]?.trim();

  return forwardedIp || request.ip || request.socket.remoteAddress || "unknown";
}

export function createRateLimiter({
  keyPrefix,
  max,
  message,
  windowMs,
  getKey = defaultRateLimitKey
}: RateLimiterOptions) {
  return function rateLimitMiddleware(
    request: Request,
    response: Response,
    next: NextFunction
  ): void {
    const now = Date.now();
    cleanupExpiredEntries(now);

    const key = `${keyPrefix}:${getKey(request)}`;
    const existingEntry = rateLimitStore.get(key);

    if (!existingEntry || existingEntry.resetAt <= now) {
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + windowMs
      });
      next();
      return;
    }

    existingEntry.count += 1;
    rateLimitStore.set(key, existingEntry);

    if (existingEntry.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existingEntry.resetAt - now) / 1000));
      response.setHeader("Retry-After", retryAfterSeconds.toString());
      next(new AppError(message, 429));
      return;
    }

    next();
  };
}
