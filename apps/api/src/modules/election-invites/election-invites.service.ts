import { ElectionVoterStatus, Prisma } from "@prisma/client";

import { env } from "../../config/env";
import { AppError } from "../../lib/app-error";
import { sendMail } from "../../lib/mailer";
import { prisma } from "../../lib/prisma";
import { slugify } from "../../lib/slug";
import { recordAuditLog } from "../audit/audit.service";
import { generateElectionInviteToken, hashElectionInviteToken } from "./election-invites.tokens";
import type { SendElectionInvitesInput } from "./election-invites.schemas";

type ElectionVoterWithLatestInvite = {
  id: string;
  memberUniqueId: string;
  fullName: string;
  email: string;
  status: ElectionVoterStatus;
  invites: Array<{
    id: string;
    sentAt: Date | null;
    usedAt: Date | null;
    revokedAt: Date | null;
  }>;
};

const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;

function resolveElectionInviteExpiry(sentAt: Date, electionEndsAt: Date | null): Date {
  const defaultExpiry = new Date(sentAt.getTime() + SEVEN_DAYS_IN_MS);

  if (!electionEndsAt) {
    return defaultExpiry;
  }

  return electionEndsAt.getTime() < defaultExpiry.getTime() ? electionEndsAt : defaultExpiry;
}

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

  while (await prisma.election.findUnique({ where: { publicSlug } })) {
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

function buildElectionClaimUrl(publicSlug: string, token: string) {
  return `${env.CLIENT_URL.replace(/\/$/, "")}/claim/${publicSlug}?token=${encodeURIComponent(token)}`;
}

function latestInvite(voter: ElectionVoterWithLatestInvite) {
  return voter.invites[0] ?? null;
}

function getBulkSendSkipReason(voter: ElectionVoterWithLatestInvite) {
  const latest = latestInvite(voter);

  if (voter.status === ElectionVoterStatus.CLAIMED) {
    return "already_claimed";
  }

  if (voter.status === ElectionVoterStatus.VOTED) {
    return "already_voted";
  }

  if (voter.status === ElectionVoterStatus.REVOKED) {
    return "revoked";
  }

  if (voter.status === ElectionVoterStatus.EXPIRED) {
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
  voter: ElectionVoterWithLatestInvite;
  actorUserId: string;
  action: "election_invite.sent" | "election_invite.resent";
}) {
  const token = generateElectionInviteToken();
  const tokenHash = hashElectionInviteToken(token);
  const sentAt = new Date();
  const expiresAt = resolveElectionInviteExpiry(sentAt, input.electionEndsAt);
  const claimUrl = buildElectionClaimUrl(input.publicSlug, token);

  await prisma.$transaction(async (transaction) => {
    await transaction.electionInvite.updateMany({
      where: {
        electionVoterId: input.voter.id,
        revokedAt: null,
        usedAt: null
      },
      data: {
        revokedAt: sentAt
      }
    });

    await transaction.electionInvite.create({
      data: {
        electionId: input.electionId,
        electionVoterId: input.voter.id,
        createdByUserId: input.actorUserId,
        tokenHash,
        expiresAt,
        sentAt,
        lastSentAt: sentAt,
        resentCount: input.action === "election_invite.resent" ? 1 : 0
      }
    });

    await transaction.electionVoter.update({
      where: { id: input.voter.id },
      data: {
        status: ElectionVoterStatus.INVITED
      }
    });

    await recordAuditLog(
      {
        organizationId: input.organizationId,
        electionId: input.electionId,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: "election_voter",
        targetId: input.voter.id,
        metadata: {
          memberUniqueId: input.voter.memberUniqueId,
          email: input.voter.email,
          expiresAt: expiresAt.toISOString()
        }
      },
      transaction
    );
  });

  const startsAtText = input.electionStartsAt ? input.electionStartsAt.toLocaleString() : "To be announced";
  const endsAtText = input.electionEndsAt ? input.electionEndsAt.toLocaleString() : "To be announced";

  await sendMail({
    to: input.voter.email,
    subject: `Your access link for ${input.electionTitle}`,
    text: [
      `Hello ${input.voter.fullName},`,
      "",
      `You have been approved to vote in ${input.electionTitle} for ${input.organizationName}.`,
      `Election window: ${startsAtText} to ${endsAtText}.`,
      `Use this claim link to access your election invite: ${claimUrl}`,
      `You will also be asked to confirm your member_unique_id: ${input.voter.memberUniqueId}.`,
      "",
      `This link expires on ${expiresAt.toLocaleString()}.`
    ].join("\n")
  });

  return {
    electionVoterId: input.voter.id,
    email: input.voter.email,
    expiresAt: expiresAt.toISOString(),
    ...(env.NODE_ENV === "test"
      ? {
          claimToken: token
        }
      : {})
  };
}

export async function previewElectionInvites(
  organizationId: string,
  electionId: string,
  input: SendElectionInvitesInput
) {
  await getElectionWithOrganizationOrThrow(organizationId, electionId);

  const voters = await prisma.electionVoter.findMany({
    where: {
      electionId,
      ...(input.electionVoterIds?.length ? { id: { in: input.electionVoterIds } } : {}),
      ...(input.search
        ? {
            OR: [
              { email: { contains: input.search, mode: "insensitive" } },
              { fullName: { contains: input.search, mode: "insensitive" } },
              { memberUniqueId: { contains: input.search, mode: "insensitive" } }
            ]
          }
        : {})
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

  return {
    total: voters.length,
    voters: voters.map((voter) => ({
      id: voter.id,
      email: voter.email,
      fullName: voter.fullName,
      status: voter.status,
      skipReason: getBulkSendSkipReason(voter)
    }))
  };
}

export async function sendElectionInvites(
  organizationId: string,
  electionId: string,
  input: SendElectionInvitesInput,
  actorUserId: string
) {
  const election = await getElectionWithOrganizationOrThrow(organizationId, electionId);

  if (!election.endsAt) {
    throw new AppError("Set an election end time before sending invite emails.", 400);
  }

  const publicSlug = await ensureElectionPublicSlug(election.id, election.title);
  const voters = await prisma.electionVoter.findMany({
    where: {
      electionId,
      ...(input.electionVoterIds?.length ? { id: { in: input.electionVoterIds } } : {}),
      ...(input.search
        ? {
            OR: [
              { email: { contains: input.search, mode: "insensitive" } },
              { fullName: { contains: input.search, mode: "insensitive" } },
              { memberUniqueId: { contains: input.search, mode: "insensitive" } }
            ]
          }
        : {})
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

  if (voters.length === 0) {
    throw new AppError("No voter registry records matched this send request.", 404);
  }

  const sent: Array<{ electionVoterId: string; email: string; expiresAt: string }> = [];
  const skipped: Array<{ electionVoterId: string; email: string; reason: string }> = [];

  for (const voter of voters) {
    const reason = getBulkSendSkipReason(voter);

    if (reason) {
      skipped.push({
        electionVoterId: voter.id,
        email: voter.email,
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
        voter,
        actorUserId,
        action: "election_invite.sent"
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

export async function resendElectionInvite(
  organizationId: string,
  electionId: string,
  electionVoterId: string,
  actorUserId: string
) {
  const election = await getElectionWithOrganizationOrThrow(organizationId, electionId);

  if (!election.endsAt) {
    throw new AppError("Set an election end time before resending invite emails.", 400);
  }

  const voter = await prisma.electionVoter.findFirst({
    where: {
      id: electionVoterId,
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

  if (!voter) {
    throw new AppError("Election voter record not found.", 404);
  }

  if (
    voter.status === ElectionVoterStatus.CLAIMED ||
    voter.status === ElectionVoterStatus.VOTED ||
    voter.status === ElectionVoterStatus.REVOKED ||
    voter.status === ElectionVoterStatus.EXPIRED
  ) {
    throw new AppError("This voter is not eligible for invite resend.", 409);
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
    voter,
    actorUserId,
    action: "election_invite.resent"
  });

  return {
    message: `Resent invite to ${voter.email}.`,
    sentCount: 1,
    skippedCount: 0,
    sent: [sent],
    skipped: []
  };
}

export async function revokeUnusedInvites(
  organizationId: string,
  electionId: string,
  electionVoterId: string,
  actorUserId: string
) {
  const voter = await prisma.electionVoter.findFirst({
    where: {
      id: electionVoterId,
      electionId,
      election: {
        organizationId
      }
    },
    select: { id: true }
  });

  if (!voter) {
    throw new AppError("Election voter record not found.", 404);
  }

  const revokedAt = new Date();
  const result = await prisma.$transaction(async (transaction) => {
    const updateResult = await transaction.electionInvite.updateMany({
      where: {
        electionId,
        electionVoterId,
        usedAt: null,
        revokedAt: null
      },
      data: {
        revokedAt
      }
    });

    await recordAuditLog(
      {
        organizationId,
        electionId,
        actorUserId,
        action: "election_invite.revoked",
        targetType: "election_voter",
        targetId: electionVoterId,
        metadata: {
          revokedCount: updateResult.count
        }
      },
      transaction
    );

    return updateResult;
  });

  return {
    revokedCount: result.count
  };
}
