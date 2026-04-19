import { Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { prisma } from "../../lib/prisma";
import { recordAuditLog } from "../audit/audit.service";
import {
  parseElectionVoterImport,
  type ParsedElectionVoterRow,
  type RejectedElectionVoterRow
} from "./election-voters.import";
import type {
  CommitElectionVoterImportInput,
  ListElectionVotersQuery,
  PreviewElectionVoterImportInput
} from "./election-voters.schemas";

type StoredVoterImportSummary = {
  acceptedRows: ParsedElectionVoterRow[];
  rejectedRows: RejectedElectionVoterRow[];
  acceptedCount: number;
  rejectedCount: number;
  note?: string | null;
};

async function getElectionWithOrganizationOrThrow(organizationId: string, electionId: string) {
  const election = await prisma.election.findFirst({
    where: {
      id: electionId,
      organizationId
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      },
      _count: {
        select: {
          ballots: true,
          voters: true
        }
      }
    }
  });

  if (!election) {
    throw new AppError("Election not found in this organization.", 404);
  }

  return election;
}

function summarizeVoterRoster(
  voters: Array<{
    status: string;
    invites: Array<{
      sentAt: Date | null;
      usedAt: Date | null;
      revokedAt: Date | null;
    }>;
  }>,
  ballotsSubmitted: number
) {
  return voters.reduce(
    (summary, voter) => {
      summary.importedCount += 1;

      const latestInvite = voter.invites[0];

      if (latestInvite?.sentAt) {
        summary.invitesSentCount += 1;
      }

      if (voter.status === "CLAIMED" || voter.status === "VOTED") {
        summary.claimedCount += 1;
      }

      if (voter.status === "VOTED") {
        summary.votedCount += 1;
      }

      if (voter.status === "REVOKED") {
        summary.revokedCount += 1;
      }

      if (voter.status === "EXPIRED") {
        summary.expiredCount += 1;
      }

      if (latestInvite?.usedAt) {
        summary.usedInviteCount += 1;
      }

      return summary;
    },
    {
      importedCount: 0,
      invitesSentCount: 0,
      claimedCount: 0,
      votedCount: 0,
      revokedCount: 0,
      expiredCount: 0,
      usedInviteCount: 0,
      ballotsSubmitted
    }
  );
}

function parseStoredImportSummary(summary: Prisma.JsonValue | null): StoredVoterImportSummary {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new AppError("This import preview is no longer available. Upload the file again.", 400);
  }

  const parsed = summary as Record<string, unknown>;
  const acceptedRows = Array.isArray(parsed.acceptedRows) ? (parsed.acceptedRows as ParsedElectionVoterRow[]) : [];
  const rejectedRows = Array.isArray(parsed.rejectedRows)
    ? (parsed.rejectedRows as RejectedElectionVoterRow[])
    : [];

  return {
    acceptedRows,
    rejectedRows,
    acceptedCount: typeof parsed.acceptedCount === "number" ? parsed.acceptedCount : acceptedRows.length,
    rejectedCount: typeof parsed.rejectedCount === "number" ? parsed.rejectedCount : rejectedRows.length,
    note: typeof parsed.note === "string" ? parsed.note : null
  };
}

export async function listElectionVoterRoster(
  organizationId: string,
  electionId: string,
  query: ListElectionVotersQuery
) {
  const election = await getElectionWithOrganizationOrThrow(organizationId, electionId);

  const voterWhere: Prisma.ElectionVoterWhereInput = {
    electionId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { fullName: { contains: query.search, mode: "insensitive" } },
            { email: { contains: query.search, mode: "insensitive" } },
            { memberUniqueId: { contains: query.search, mode: "insensitive" } }
          ]
        }
      : {})
  };

  const summaryVoters = await prisma.electionVoter.findMany({
    where: { electionId },
    include: {
      invites: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  const voters = await prisma.electionVoter.findMany({
    where: voterWhere,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      importJob: {
        select: {
          id: true,
          filename: true,
          sourceFormat: true,
          committedAt: true,
          createdAt: true
        }
      },
      invites: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  return {
    election: {
      id: election.id,
      title: election.title,
      slug: election.slug,
      publicSlug: election.publicSlug ?? election.slug,
      status: election.status,
      startsAt: election.startsAt,
      endsAt: election.endsAt,
      organization: election.organization
    },
    summary: summarizeVoterRoster(summaryVoters, election._count.ballots),
    voters: voters.map((voter) => ({
      id: voter.id,
      memberUniqueId: voter.memberUniqueId,
      fullName: voter.fullName,
      email: voter.email,
      phone: voter.phone,
      status: voter.status,
      claimedAt: voter.claimedAt,
      votedAt: voter.votedAt,
      createdAt: voter.createdAt,
      importJob: voter.importJob,
      latestInvite:
        voter.invites[0] === undefined
          ? null
          : {
              id: voter.invites[0].id,
              expiresAt: voter.invites[0].expiresAt,
              sentAt: voter.invites[0].sentAt,
              usedAt: voter.invites[0].usedAt,
              revokedAt: voter.invites[0].revokedAt,
              createdAt: voter.invites[0].createdAt
            }
    }))
  };
}

export async function previewElectionVoterImport(
  organizationId: string,
  electionId: string,
  input: PreviewElectionVoterImportInput,
  actorUserId: string
) {
  const election = await getElectionWithOrganizationOrThrow(organizationId, electionId);
  const existingVoters = await prisma.electionVoter.findMany({
    where: { electionId },
    select: {
      memberUniqueId: true,
      email: true
    }
  });

  const parsed = parseElectionVoterImport(input, {
    memberUniqueIds: existingVoters.map((entry) => entry.memberUniqueId),
    emails: existingVoters.map((entry) => entry.email)
  });

  const importJob = await prisma.$transaction(async (transaction) => {
    const createdImportJob = await transaction.electionVoterImportJob.create({
      data: {
        electionId,
        uploadedByUserId: actorUserId,
        filename: input.filename.trim(),
        sourceFormat: input.format,
        summary: {
          acceptedRows: parsed.acceptedRows,
          rejectedRows: parsed.rejectedRows,
          acceptedCount: parsed.summary.acceptedCount,
          rejectedCount: parsed.summary.rejectedCount
        }
      }
    });

    await recordAuditLog(
      {
        organizationId,
        electionId: election.id,
        actorUserId,
        action: "election_voter_import.previewed",
        targetType: "election_voter_import",
        targetId: createdImportJob.id,
        metadata: {
          electionTitle: election.title,
          filename: input.filename.trim(),
          sourceFormat: input.format,
          acceptedCount: parsed.summary.acceptedCount,
          rejectedCount: parsed.summary.rejectedCount
        }
      },
      transaction
    );

    return createdImportJob;
  });

  return {
    importId: importJob.id,
    acceptedRows: parsed.acceptedRows,
    rejectedRows: parsed.rejectedRows,
    summary: parsed.summary
  };
}

export async function commitElectionVoterImport(
  organizationId: string,
  electionId: string,
  importId: string,
  input: CommitElectionVoterImportInput,
  actorUserId: string
) {
  const election = await getElectionWithOrganizationOrThrow(organizationId, electionId);
  const importJob = await prisma.electionVoterImportJob.findFirst({
    where: {
      id: importId,
      electionId,
      election: {
        organizationId
      }
    },
    select: {
      id: true,
      filename: true,
      committedAt: true,
      summary: true
    }
  });

  if (!importJob) {
    throw new AppError("Voter import preview not found.", 404);
  }

  if (importJob.committedAt) {
    throw new AppError("This import has already been committed.", 409);
  }

  const summary = parseStoredImportSummary(importJob.summary);

  if (summary.acceptedRows.length === 0) {
    throw new AppError("There are no valid rows to commit from this import.", 400);
  }

  const existingVoters = await prisma.electionVoter.findMany({
    where: { electionId },
    select: {
      memberUniqueId: true,
      email: true
    }
  });

  const existingMemberIds = new Set(existingVoters.map((entry) => entry.memberUniqueId));
  const existingEmails = new Set(existingVoters.map((entry) => entry.email.toLowerCase()));
  const conflictingRows = summary.acceptedRows.filter(
    (row) => existingMemberIds.has(row.memberUniqueId) || existingEmails.has(row.email.toLowerCase())
  );

  if (conflictingRows.length > 0) {
    throw new AppError(
      `Some rows now conflict with existing voter registry entries (${conflictingRows
        .map((row) => `row ${row.rowNumber}`)
        .join(", ")}). Preview the file again before committing.`,
      409
    );
  }

  const committedImportJob = await prisma.$transaction(async (transaction) => {
    await transaction.electionVoter.createMany({
      data: summary.acceptedRows.map((row) => ({
        electionId,
        importJobId: importId,
        memberUniqueId: row.memberUniqueId,
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        status: "IMPORTED"
      }))
    });

    const updatedImportJob = await transaction.electionVoterImportJob.update({
      where: { id: importId },
      data: {
        committedAt: new Date(),
        summary: {
          acceptedRows: summary.acceptedRows,
          rejectedRows: summary.rejectedRows,
          acceptedCount: summary.acceptedCount,
          rejectedCount: summary.rejectedCount,
          note: input.note?.trim() || null
        }
      },
      select: {
        id: true,
        committedAt: true
      }
    });

    await recordAuditLog(
      {
        organizationId,
        electionId: election.id,
        actorUserId,
        action: "election_voter_import.committed",
        targetType: "election_voter_import",
        targetId: importId,
        metadata: {
          electionTitle: election.title,
          filename: importJob.filename,
          committedCount: summary.acceptedRows.length,
          note: input.note?.trim() || null
        }
      },
      transaction
    );

    return updatedImportJob;
  });

  return {
    importJob: committedImportJob,
    committedCount: summary.acceptedRows.length
  };
}
