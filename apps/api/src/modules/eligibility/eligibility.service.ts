import { ElectionEligibilityStatus, Prisma } from "@prisma/client";

import { AppError } from "../../lib/app-error";
import { env } from "../../config/env";
import { sendMail } from "../../lib/mailer";
import { prisma } from "../../lib/prisma";
import { slugify } from "../../lib/slug";
import { recordAuditLog } from "../audit/audit.service";
import {
  parseElectionEligibilityImport,
  type ParsedEligibilityRow,
  type RejectedEligibilityRow
} from "./eligibility.import";
import { resolveElectionInviteExpiry } from "./eligibility.policy";
import type {
  CommitElectionEligibilityImportInput,
  ListElectionEligibilityQuery,
  PreviewElectionEligibilityImportInput,
  PublicElectionClaimInput,
  SendElectionInvitationsInput
} from "./eligibility.schemas";
import { generateElectionInviteToken, hashElectionInviteToken } from "./eligibility.tokens";

type StoredEligibilityImportSummary = {
  acceptedRows: ParsedEligibilityRow[];
  rejectedRows: RejectedEligibilityRow[];
  acceptedCount: number;
  rejectedCount: number;
  note?: string | null;
};

type EligibilityWithLatestInvite = {
  id: string;
  memberUniqueId: string;
  fullName: string;
  email: string;
  status: ElectionEligibilityStatus;
  invites: Array<{
    id: string;
    sentAt: Date | null;
    usedAt: Date | null;
    revokedAt: Date | null;
  }>;
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
          eligibilities: true
        }
      }
    }
  });

  if (!election) {
    throw new AppError("Election not found in this organization.", 404);
  }

  return election;
}

async function buildUniquePublicElectionSlug(title: string) {
  const base = slugify(title) || "election";
  let publicSlug = base;
  let sequence = 1;

  while (
    await prisma.election.findUnique({
      where: {
        publicSlug
      }
    })
  ) {
    publicSlug = `${base}-${sequence}`;
    sequence += 1;
  }

  return publicSlug;
}

async function ensureElectionPublicSlug(electionId: string, fallbackTitle: string) {
  const existing = await prisma.election.findUnique({
    where: { id: electionId },
    select: {
      publicSlug: true
    }
  });

  if (existing?.publicSlug) {
    return existing.publicSlug;
  }

  const publicSlug = await buildUniquePublicElectionSlug(fallbackTitle);
  const updated = await prisma.election.update({
    where: { id: electionId },
    data: {
      publicSlug
    },
    select: {
      publicSlug: true
    }
  });

  return updated.publicSlug!;
}

function summarizeEligibilityRoster(
  eligibilities: Array<{
    status: string;
    invites: Array<{
      sentAt: Date | null;
      usedAt: Date | null;
      revokedAt: Date | null;
    }>;
  }>,
  ballotsSubmitted: number
) {
  return eligibilities.reduce(
    (summary, eligibility) => {
      summary.importedEligibleCount += 1;

      const latestInvite = eligibility.invites[0];

      if (latestInvite?.sentAt) {
        summary.invitesSentCount += 1;
      }

      if (eligibility.status === "CLAIMED" || eligibility.status === "VOTED") {
        summary.claimedCount += 1;
      }

      if (eligibility.status === "VOTED") {
        summary.votedCount += 1;
      }

      if (eligibility.status === "REVOKED") {
        summary.revokedCount += 1;
      }

      if (eligibility.status === "EXPIRED") {
        summary.expiredCount += 1;
      }

      if (latestInvite?.usedAt) {
        summary.usedInviteCount += 1;
      }

      return summary;
    },
    {
      importedEligibleCount: 0,
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

function parseStoredImportSummary(summary: Prisma.JsonValue | null): StoredEligibilityImportSummary {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new AppError("This import preview is no longer available. Upload the file again.", 400);
  }

  const parsed = summary as Record<string, unknown>;
  const acceptedRows = Array.isArray(parsed.acceptedRows) ? (parsed.acceptedRows as ParsedEligibilityRow[]) : [];
  const rejectedRows = Array.isArray(parsed.rejectedRows) ? (parsed.rejectedRows as RejectedEligibilityRow[]) : [];

  return {
    acceptedRows,
    rejectedRows,
    acceptedCount: typeof parsed.acceptedCount === "number" ? parsed.acceptedCount : acceptedRows.length,
    rejectedCount: typeof parsed.rejectedCount === "number" ? parsed.rejectedCount : rejectedRows.length,
    note: typeof parsed.note === "string" ? parsed.note : null
  };
}

function buildElectionClaimUrl(publicSlug: string, token: string) {
  return `${env.CLIENT_URL.replace(/\/$/, "")}/claim/${publicSlug}?token=${encodeURIComponent(token)}`;
}

function latestInvite(eligibility: EligibilityWithLatestInvite) {
  return eligibility.invites[0] ?? null;
}

function getBulkSendSkipReason(eligibility: EligibilityWithLatestInvite) {
  const latest = latestInvite(eligibility);

  if (eligibility.status === ElectionEligibilityStatus.CLAIMED) {
    return "already_claimed";
  }

  if (eligibility.status === ElectionEligibilityStatus.VOTED) {
    return "already_voted";
  }

  if (eligibility.status === ElectionEligibilityStatus.REVOKED) {
    return "revoked";
  }

  if (eligibility.status === ElectionEligibilityStatus.EXPIRED) {
    return "expired";
  }

  if (latest?.sentAt && !latest.revokedAt) {
    return "already_sent";
  }

  return null;
}

async function createAndSendInvite(input: {
  organizationId: string;
  electionId: string;
  electionTitle: string;
  electionStartsAt: Date | null;
  electionEndsAt: Date | null;
  organizationName: string;
  publicSlug: string;
  eligibility: EligibilityWithLatestInvite;
  actorUserId: string;
  action: "eligibility_invite.sent" | "eligibility_invite.resent";
}) {
  const token = generateElectionInviteToken();
  const tokenHash = hashElectionInviteToken(token);
  const sentAt = new Date();
  const expiresAt = resolveElectionInviteExpiry(sentAt, input.electionEndsAt);
  const claimUrl = buildElectionClaimUrl(input.publicSlug, token);

  await prisma.$transaction(async (transaction) => {
    await transaction.electionInvite.updateMany({
      where: {
        eligibilityId: input.eligibility.id,
        revokedAt: null,
        usedAt: null
      },
      data: {
        revokedAt: sentAt
      }
    });

    await transaction.electionInvite.create({
      data: {
        eligibilityId: input.eligibility.id,
        tokenHash,
        expiresAt,
        sentAt
      }
    });

    await transaction.electionEligibility.update({
      where: { id: input.eligibility.id },
      data: {
        status: ElectionEligibilityStatus.INVITED
      }
    });

    await recordAuditLog(
      {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: "election_eligibility",
        targetId: input.eligibility.id,
        metadata: {
          electionId: input.electionId,
          memberUniqueId: input.eligibility.memberUniqueId,
          email: input.eligibility.email,
          expiresAt: expiresAt.toISOString()
        }
      },
      transaction
    );
  });

  const startsAtText = input.electionStartsAt ? input.electionStartsAt.toLocaleString() : "To be announced";
  const endsAtText = input.electionEndsAt ? input.electionEndsAt.toLocaleString() : "To be announced";

  await sendMail({
    to: input.eligibility.email,
    subject: `Your access link for ${input.electionTitle}`,
    text: [
      `Hello ${input.eligibility.fullName},`,
      "",
      `You have been approved to vote in ${input.electionTitle} for ${input.organizationName}.`,
      `Election window: ${startsAtText} to ${endsAtText}.`,
      `Use this claim link to access your election invite: ${claimUrl}`,
      `You will also be asked to confirm your member_unique_id: ${input.eligibility.memberUniqueId}.`,
      "",
      `This link expires on ${expiresAt.toLocaleString()}.`
    ].join("\n")
  });

  return {
    eligibilityId: input.eligibility.id,
    email: input.eligibility.email,
    expiresAt: expiresAt.toISOString()
  };
}

export async function listElectionEligibilityRoster(
  organizationId: string,
  electionId: string,
  query: ListElectionEligibilityQuery
) {
  const election = await getElectionWithOrganizationOrThrow(organizationId, electionId);

  const eligibilityWhere: Prisma.ElectionEligibilityWhereInput = {
    electionId,
    ...(query.status ? { status: query.status } : {})
  };
  const summaryEligibilities = await prisma.electionEligibility.findMany({
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

  const eligibilities = await prisma.electionEligibility.findMany({
    where: eligibilityWhere,
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" }
    ],
    include: {
      claimedBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      },
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
    summary: summarizeEligibilityRoster(summaryEligibilities, election._count.ballots),
    eligibilities: eligibilities.map((eligibility) => ({
      id: eligibility.id,
      memberUniqueId: eligibility.memberUniqueId,
      fullName: eligibility.fullName,
      age: eligibility.age,
      email: eligibility.email,
      status: eligibility.status,
      claimedAt: eligibility.claimedAt,
      votedAt: eligibility.votedAt,
      createdAt: eligibility.createdAt,
      importJob: eligibility.importJob,
      claimedBy: eligibility.claimedBy,
      latestInvite:
        eligibility.invites[0] === undefined
          ? null
          : {
              id: eligibility.invites[0].id,
              expiresAt: eligibility.invites[0].expiresAt,
              sentAt: eligibility.invites[0].sentAt,
              usedAt: eligibility.invites[0].usedAt,
              revokedAt: eligibility.invites[0].revokedAt,
              createdAt: eligibility.invites[0].createdAt
            }
    }))
  };
}

export async function previewElectionEligibilityImport(
  organizationId: string,
  electionId: string,
  input: PreviewElectionEligibilityImportInput,
  actorUserId: string
) {
  const election = await getElectionWithOrganizationOrThrow(organizationId, electionId);
  const existingEligibilities = await prisma.electionEligibility.findMany({
    where: { electionId },
    select: {
      memberUniqueId: true,
      email: true
    }
  });
  const parsed = parseElectionEligibilityImport(input, {
    memberUniqueIds: existingEligibilities.map((entry) => entry.memberUniqueId),
    emails: existingEligibilities.map((entry) => entry.email)
  });

  const importJob = await prisma.$transaction(async (transaction) => {
    const createdImportJob = await transaction.electionEligibilityImportJob.create({
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
        actorUserId,
        action: "eligibility_import.previewed",
        targetType: "eligibility_import",
        targetId: createdImportJob.id,
        metadata: {
          electionId: election.id,
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

export async function commitElectionEligibilityImport(
  organizationId: string,
  electionId: string,
  importId: string,
  input: CommitElectionEligibilityImportInput,
  actorUserId: string
) {
  const election = await getElectionWithOrganizationOrThrow(organizationId, electionId);
  const importJob = await prisma.electionEligibilityImportJob.findFirst({
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
    throw new AppError("Eligibility import preview not found.", 404);
  }

  if (importJob.committedAt) {
    throw new AppError("This import has already been committed.", 409);
  }

  const summary = parseStoredImportSummary(importJob.summary);

  if (summary.acceptedRows.length === 0) {
    throw new AppError("There are no valid rows to commit from this import.", 400);
  }

  const existingEligibilities = await prisma.electionEligibility.findMany({
    where: { electionId },
    select: {
      memberUniqueId: true,
      email: true
    }
  });
  const existingMemberIds = new Set(existingEligibilities.map((entry) => entry.memberUniqueId));
  const existingEmails = new Set(existingEligibilities.map((entry) => entry.email.toLowerCase()));
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
    await transaction.electionEligibility.createMany({
      data: summary.acceptedRows.map((row) => ({
        electionId,
        importJobId: importId,
        memberUniqueId: row.memberUniqueId,
        fullName: row.fullName,
        age: row.age,
        email: row.email,
        status: "PENDING"
      }))
    });

    const updatedImportJob = await transaction.electionEligibilityImportJob.update({
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
        actorUserId,
        action: "eligibility_import.committed",
        targetType: "eligibility_import",
        targetId: importId,
        metadata: {
          electionId: election.id,
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

export async function sendElectionInvitations(
  organizationId: string,
  electionId: string,
  input: SendElectionInvitationsInput,
  actorUserId: string
) {
  const election = await getElectionWithOrganizationOrThrow(organizationId, electionId);

  if (!election.endsAt) {
    throw new AppError("Set an election end time before sending invite emails.", 400);
  }

  const publicSlug = await ensureElectionPublicSlug(election.id, election.title);
  const eligibilities = await prisma.electionEligibility.findMany({
    where: {
      electionId,
      ...(input.eligibilityIds?.length ? { id: { in: input.eligibilityIds } } : {})
    },
    orderBy: {
      createdAt: "asc"
    },
    include: {
      invites: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  if (eligibilities.length === 0) {
    throw new AppError("No voter registry records matched this send request.", 404);
  }

  const sent: Array<{ eligibilityId: string; email: string; expiresAt: string }> = [];
  const skipped: Array<{ eligibilityId: string; email: string; reason: string }> = [];

  for (const eligibility of eligibilities) {
    const reason = getBulkSendSkipReason(eligibility);

    if (reason) {
      skipped.push({
        eligibilityId: eligibility.id,
        email: eligibility.email,
        reason
      });
      continue;
    }

    sent.push(
      await createAndSendInvite({
        organizationId,
        electionId,
        electionTitle: election.title,
        electionStartsAt: election.startsAt,
        electionEndsAt: election.endsAt,
        organizationName: election.organization.name,
        publicSlug,
        eligibility,
        actorUserId,
        action: "eligibility_invite.sent"
      })
    );
  }

  return {
    message:
      sent.length > 0
        ? `Sent ${sent.length} invite${sent.length === 1 ? "" : "s"}.`
        : "No invites were sent.",
    sentCount: sent.length,
    skippedCount: skipped.length,
    sent,
    skipped
  };
}

export async function resendElectionInvitation(
  organizationId: string,
  electionId: string,
  eligibilityId: string,
  actorUserId: string
) {
  const election = await getElectionWithOrganizationOrThrow(organizationId, electionId);

  if (!election.endsAt) {
    throw new AppError("Set an election end time before resending invite emails.", 400);
  }

  const eligibility = await prisma.electionEligibility.findFirst({
    where: {
      id: eligibilityId,
      electionId
    },
    include: {
      invites: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  if (!eligibility) {
    throw new AppError("Election eligibility record not found.", 404);
  }

  if (
    eligibility.status === ElectionEligibilityStatus.CLAIMED ||
    eligibility.status === ElectionEligibilityStatus.VOTED ||
    eligibility.status === ElectionEligibilityStatus.REVOKED ||
    eligibility.status === ElectionEligibilityStatus.EXPIRED
  ) {
    throw new AppError("This record is not eligible for invite resend.", 409);
  }

  const publicSlug = await ensureElectionPublicSlug(election.id, election.title);
  const sent = await createAndSendInvite({
    organizationId,
    electionId,
    electionTitle: election.title,
    electionStartsAt: election.startsAt,
    electionEndsAt: election.endsAt,
    organizationName: election.organization.name,
    publicSlug,
    eligibility,
    actorUserId,
    action: "eligibility_invite.resent"
  });

  return {
    message: `Resent invite to ${eligibility.email}.`,
    sentCount: 1,
    skippedCount: 0,
    sent: [sent],
    skipped: []
  };
}

export async function getPublicElectionClaimContext(electionSlug: string, _token: string) {
  const election = await prisma.election.findUnique({
    where: {
      publicSlug: electionSlug
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true
        }
      }
    }
  });

  if (!election) {
    throw new AppError("Election claim link not found.", 404);
  }

  throw new AppError(
    "Public election claim is not implemented yet. Milestone 3 will add token validation and voter account claim.",
    501
  );
}

export async function claimPublicElectionInvite(
  electionSlug: string,
  _input: PublicElectionClaimInput
) {
  const election = await prisma.election.findUnique({
    where: {
      publicSlug: electionSlug
    }
  });

  if (!election) {
    throw new AppError("Election claim link not found.", 404);
  }

  throw new AppError(
    "Public election claim is not implemented yet. Milestone 3 will create or link voter accounts after invite verification.",
    501
  );
}
