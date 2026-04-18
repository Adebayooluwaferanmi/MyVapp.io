import { describe, expect, it } from "vitest";

import { listAuditLogsQuerySchema } from "./audit.schemas";

describe("listAuditLogsQuerySchema", () => {
  it("defaults limit to 25", () => {
    expect(listAuditLogsQuerySchema.parse({})).toEqual({
      limit: 25
    });
  });

  it("rejects limits above 100", () => {
    expect(() => listAuditLogsQuerySchema.parse({ limit: 101 })).toThrow();
  });
});
