import type { Request } from "express";

export type AuditRequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export function getRequestAuditContext(request: Request): AuditRequestContext {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(",")[0]?.trim();

  return {
    ipAddress: forwardedIp || request.ip || request.socket.remoteAddress || null,
    userAgent: request.headers["user-agent"] ?? null
  };
}
