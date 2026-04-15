import type { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";

export type RecordAuditLogInput = {
  organizationId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
};

type AuditLogRecord = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  actor: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
};

function mapAuditLog(log: AuditLogRecord) {
  return {
    id: log.id,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    metadata: log.metadata,
    createdAt: log.createdAt,
    actor: log.actor
  };
}

export async function recordAuditLog(
  input: RecordAuditLogInput,
  transaction: Prisma.TransactionClient = prisma
) {
  await transaction.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata
    }
  });
}

export async function listAuditLogsForOrganization(organizationId: string, limit = 25) {
  const logs = await prisma.auditLog.findMany({
    where: { organizationId },
    orderBy: {
      createdAt: "desc"
    },
    take: limit,
    include: {
      actor: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true
        }
      }
    }
  });

  return logs.map(mapAuditLog);
}
