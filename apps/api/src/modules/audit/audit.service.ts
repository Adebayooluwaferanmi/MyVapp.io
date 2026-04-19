import type { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";

export type RecordAuditLogInput = {
  organizationId: string;
  electionId?: string | null;
  actorUserId?: string | null;
  actorElectionVoterId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
  previousHash?: string | null;
  entryHash?: string | null;
};

type AuditLogRecord = {
  id: string;
  organizationId: string;
  electionId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Prisma.JsonValue | null;
  previousHash: string | null;
  entryHash: string | null;
  createdAt: Date;
  actorUser: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  actorElectionVoter: {
    id: string;
    fullName: string;
    email: string;
    memberUniqueId: string;
  } | null;
};

function mapAuditLog(log: AuditLogRecord) {
  return {
    id: log.id,
    organizationId: log.organizationId,
    electionId: log.electionId,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    metadata: log.metadata,
    previousHash: log.previousHash,
    entryHash: log.entryHash,
    createdAt: log.createdAt,
    actorUser: log.actorUser,
    actorElectionVoter: log.actorElectionVoter
  };
}

export async function recordAuditLog(
  input: RecordAuditLogInput,
  transaction: Prisma.TransactionClient = prisma
) {
  await transaction.auditLog.create({
    data: {
      organizationId: input.organizationId,
      electionId: input.electionId ?? null,
      actorUserId: input.actorUserId ?? null,
      actorElectionVoterId: input.actorElectionVoterId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata,
      previousHash: input.previousHash ?? null,
      entryHash: input.entryHash ?? null
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
      actorUser: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true
        }
      },
      actorElectionVoter: {
        select: {
          id: true,
          fullName: true,
          email: true,
          memberUniqueId: true
        }
      }
    }
  });

  return logs.map((log) => mapAuditLog(log as AuditLogRecord));
}
