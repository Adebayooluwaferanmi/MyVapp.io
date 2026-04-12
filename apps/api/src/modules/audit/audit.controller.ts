import type { Request, Response } from "express";

import { organizationParamsSchema } from "../organizations/organizations.schemas";
import { listAuditLogsQuerySchema } from "./audit.schemas";
import { listAuditLogsForOrganization } from "./audit.service";

export async function getOrganizationAuditLogs(
  request: Request,
  response: Response
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const { limit } = listAuditLogsQuerySchema.parse(request.query);
  const auditLogs = await listAuditLogsForOrganization(organizationId, limit);

  response.status(200).json({
    auditLogs
  });
}
