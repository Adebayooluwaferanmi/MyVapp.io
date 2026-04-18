import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../lib/app-error";
import { createRateLimiter } from "./rate-limit.middleware";

function createMockRequest(overrides: Partial<Request> = {}) {
  return {
    headers: {},
    ip: "127.0.0.1",
    socket: {
      remoteAddress: "127.0.0.1"
    },
    ...overrides
  } as Request;
}

function createMockResponse() {
  return {
    setHeader: vi.fn()
  } as unknown as Response;
}

describe("createRateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests until the configured max and then blocks with 429", () => {
    const middleware = createRateLimiter({
      keyPrefix: "test-auth",
      windowMs: 60_000,
      max: 2,
      message: "Too many requests."
    });
    const request = createMockRequest();
    const response = createMockResponse();
    const next = vi.fn();

    middleware(request, response, next);
    middleware(request, response, next);
    middleware(request, response, next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(next).toHaveBeenNthCalledWith(1);
    expect(next).toHaveBeenNthCalledWith(2);
    expect(next.mock.calls[2][0]).toBeInstanceOf(AppError);
    expect((next.mock.calls[2][0] as AppError).statusCode).toBe(429);
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
  });

  it("resets counts after the configured window passes", () => {
    vi.useFakeTimers();

    const middleware = createRateLimiter({
      keyPrefix: "test-ballot",
      windowMs: 5_000,
      max: 1,
      message: "Slow down."
    });
    const request = createMockRequest();
    const response = createMockResponse();
    const next = vi.fn();

    middleware(request, response, next);
    middleware(request, response, next);
    vi.advanceTimersByTime(5_001);
    middleware(request, response, next);

    expect(next.mock.calls[1][0]).toBeInstanceOf(AppError);
    expect(next.mock.calls[2][0]).toBeUndefined();
  });
});
