import { z } from "zod";

export const listAuditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
