import crypto from "node:crypto";

export function generateElectionInviteToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashElectionInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
