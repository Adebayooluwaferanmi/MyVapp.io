import { resolve } from "node:path";

import type { Express } from "express";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

type AuthResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
};

type OrganizationResponse = {
  organization: {
    id: string;
    name: string;
    themePreset: string;
    themeOverrides: Record<string, unknown> | null;
  };
};

type ElectionResponse = {
  election: {
    id: string;
    title: string;
    status: string;
    publicSlug: string;
  };
};

type OfficeResponse = {
  office: {
    id: string;
    title: string;
  };
};

type CandidateResponse = {
  candidate: {
    id: string;
    displayName: string;
  };
};

type BallotResponse = {
  ballot: {
    id: string;
    receiptReference: string;
    votes: Array<{
      officeId: string;
      candidateId: string;
    }>;
  };
};

type AuditLogsResponse = {
  auditLogs: Array<{
    action: string;
    actorUser: {
      email: string;
    } | null;
    actorElectionVoter: {
      email: string;
    } | null;
    metadata: Record<string, unknown> | null;
  }>;
};

const runDbTests = process.env.RUN_DB_TESTS === "1";
const INTEGRATION_TIMEOUT_MS = 120_000;

describe.skipIf(!runDbTests)("manager to election-voter flow", () => {
  let app: Express;
  let prisma: PrismaClient;

  const suffix = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  const managerEmail = `integration-manager-${suffix}@myvapp.local`;
  const voterEmail = `integration-voter-${suffix}@myvapp.local`;
  const managerPassword = "IntegrationPass1!";
  const organizationName = `Integration Organization ${suffix}`;
  const electionTitle = `Integration Election ${suffix}`;

  let organizationId: string | null = null;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when RUN_DB_TESTS=1.");
    }

    process.env.NODE_ENV = "test";

    const [{ app: loadedApp }, { prisma: loadedPrisma }] = await Promise.all([
      import("../app"),
      import("../lib/prisma")
    ]);

    app = loadedApp;
    prisma = loadedPrisma;
    await prisma.$connect();
  }, INTEGRATION_TIMEOUT_MS);

  afterAll(async () => {
    if (!prisma) {
      return;
    }

    if (organizationId) {
      await prisma.organization.deleteMany({
        where: { id: organizationId }
      });
    }

    await prisma.user.deleteMany({
      where: {
        email: {
          in: [managerEmail, voterEmail]
        }
      }
    });

    await prisma.$disconnect();
  }, INTEGRATION_TIMEOUT_MS);

  it("covers manager setup, election-scoped voter ballot submission, results, and audit trail", async () => {
    const registerManagerResponse = await request(app).post("/api/v1/auth/register").send({
      firstName: "Manager",
      lastName: "Tester",
      email: managerEmail,
      password: managerPassword
    });

    expect(registerManagerResponse.status).toBe(201);

    const managerAuth = registerManagerResponse.body as AuthResponse;

    const organizationResponse = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        name: organizationName,
        description: "Integration test organization",
        themePreset: "emerald-hall",
        themeOverrides: {
          primary: "#14532d",
          accent: "#0f766e"
        }
      });

    expect(organizationResponse.status).toBe(201);

    const organizationBody = organizationResponse.body as OrganizationResponse;
    organizationId = organizationBody.organization.id;
    expect(organizationBody.organization.themePreset).toBe("emerald-hall");
    expect(organizationBody.organization.themeOverrides).toMatchObject({
      primary: "#14532d",
      accent: "#0f766e"
    });

    const createElectionResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        title: electionTitle,
        description: "Integration flow election",
        startsAt: "2026-05-10T09:00:00.000Z",
        endsAt: "2026-05-13T17:00:00.000Z",
        resultsVisibilityMode: "ORG_MANAGERS_DURING_OPEN",
        invalidatePriorSessionOnNewLogin: true
      });

    expect(createElectionResponse.status).toBe(201);

    const electionBody = createElectionResponse.body as ElectionResponse;
    const electionId = electionBody.election.id;
    const electionSlug = electionBody.election.publicSlug;

    const createOfficeResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/offices`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        title: "President",
        description: "Primary office for this integration flow",
        seats: 1,
        sortOrder: 0
      });

    expect(createOfficeResponse.status).toBe(201);

    const officeBody = createOfficeResponse.body as OfficeResponse;
    const officeId = officeBody.office.id;

    const firstCandidateResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/offices/${officeId}/candidates`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        displayName: "Ada Candidate",
        bio: "Integration candidate one"
      });

    const secondCandidateResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/offices/${officeId}/candidates`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        displayName: "Bola Candidate",
        bio: "Integration candidate two"
      });

    expect(firstCandidateResponse.status).toBe(201);
    expect(secondCandidateResponse.status).toBe(201);

    const firstCandidateBody = firstCandidateResponse.body as CandidateResponse;
    const secondCandidateBody = secondCandidateResponse.body as CandidateResponse;

    const previewImportResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/voter-imports/preview`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        filename: "integration-voters.csv",
        format: "CSV",
        contentBase64: Buffer.from(
          `member_unique_id,full_name,email,phone\nMEM-INT-001,Integration Voter,${voterEmail},+2348000000002\n`
        ).toString("base64")
      });

    expect(previewImportResponse.status).toBe(201);
    expect(previewImportResponse.body.summary).toMatchObject({
      acceptedCount: 1,
      rejectedCount: 0
    });

    const commitImportResponse = await request(app)
      .post(
        `/api/v1/organizations/${organizationId}/elections/${electionId}/voter-imports/${previewImportResponse.body.importId}/commit`
      )
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({});

    expect(commitImportResponse.status).toBe(200);
    expect(commitImportResponse.body.committedCount).toBe(1);

    const sendInvitesResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/invitations/send`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({});

    expect(sendInvitesResponse.status).toBe(202);
    expect(sendInvitesResponse.body.sentCount).toBe(1);

    const claimToken = sendInvitesResponse.body.sent[0]?.claimToken as string | undefined;
    expect(claimToken).toBeTruthy();

    const claimContextResponse = await request(app).get(
      `/api/v1/public/elections/${electionSlug}/claim-context?token=${encodeURIComponent(claimToken!)}`
    );

    expect(claimContextResponse.status).toBe(200);
    expect(claimContextResponse.body.invite.canClaim).toBe(true);

    const claimResponse = await request(app)
      .post(`/api/v1/public/elections/${electionSlug}/claim`)
      .send({
        token: claimToken,
        memberUniqueId: "MEM-INT-001"
      });

    expect(claimResponse.status).toBe(200);
    const voterAuth = claimResponse.body as {
      token: string;
      electionVoter: {
        id: string;
        email: string;
      };
    };

    expect(voterAuth.electionVoter.email).toBe(voterEmail);

    const voterThemePatchResponse = await request(app)
      .patch(`/api/v1/organizations/${organizationId}/theme`)
      .set("Authorization", `Bearer ${voterAuth.token}`)
      .send({
        themePreset: "sunrise-coral"
      });

    expect(voterThemePatchResponse.status).toBe(403);

    const managerThemePatchResponse = await request(app)
      .patch(`/api/v1/organizations/${organizationId}/theme`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        themePreset: "sunrise-coral",
        themeOverrides: {
          primary: "#c2410c",
          accent: "#ea580c"
        }
      });

    expect(managerThemePatchResponse.status).toBe(200);
    expect((managerThemePatchResponse.body as OrganizationResponse).organization.themePreset).toBe("sunrise-coral");

    const readyElectionResponse = await request(app)
      .patch(`/api/v1/organizations/${organizationId}/elections/${electionId}/status`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        status: "READY"
      });

    expect(readyElectionResponse.status).toBe(200);

    const openElectionResponse = await request(app)
      .patch(`/api/v1/organizations/${organizationId}/elections/${electionId}/status`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        status: "OPEN"
      });

    expect(openElectionResponse.status).toBe(200);

    const voterBallotResponse = await request(app)
      .get(`/api/v1/organizations/${organizationId}/elections/${electionId}/ballot`)
      .set("Authorization", `Bearer ${voterAuth.token}`);

    expect(voterBallotResponse.status).toBe(200);
    expect(voterBallotResponse.body.offices).toHaveLength(1);
    expect(voterBallotResponse.body.offices[0]?.candidates).toHaveLength(2);

    const submitBallotResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/ballot`)
      .set("Authorization", `Bearer ${voterAuth.token}`)
      .send({
        selections: [
          {
            officeId,
            candidateId: firstCandidateBody.candidate.id
          }
        ]
      });

    expect(submitBallotResponse.status).toBe(201);

    const ballotBody = submitBallotResponse.body as BallotResponse;
    expect(ballotBody.ballot.receiptReference).toMatch(/^RCPT-/);
    expect(ballotBody.ballot.votes).toHaveLength(1);
    expect(ballotBody.ballot.votes[0]).toMatchObject({
      officeId,
      candidateId: firstCandidateBody.candidate.id
    });

    const duplicateBallotResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/ballot`)
      .set("Authorization", `Bearer ${voterAuth.token}`)
      .send({
        selections: [
          {
            officeId,
            candidateId: secondCandidateBody.candidate.id
          }
        ]
      });

    expect(duplicateBallotResponse.status).toBe(403);
    expect(duplicateBallotResponse.body.message).toContain("claimed election voter sessions");

    const managerResultsResponse = await request(app)
      .get(`/api/v1/organizations/${organizationId}/elections/${electionId}/results`)
      .set("Authorization", `Bearer ${managerAuth.token}`);

    expect(managerResultsResponse.status).toBe(200);
    expect(managerResultsResponse.body.offices).toEqual([
      {
        officeId,
        title: "President",
        seats: 1,
        totalVotes: 1,
        candidates: [
          {
            candidateId: firstCandidateBody.candidate.id,
            displayName: "Ada Candidate",
            votes: 1
          },
          {
            candidateId: secondCandidateBody.candidate.id,
            displayName: "Bola Candidate",
            votes: 0
          }
        ]
      }
    ]);

    const closeElectionResponse = await request(app)
      .patch(`/api/v1/organizations/${organizationId}/elections/${electionId}/status`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        status: "CLOSED"
      });

    expect(closeElectionResponse.status).toBe(200);

    const auditLogsResponse = await request(app)
      .get(`/api/v1/organizations/${organizationId}/audit-logs?limit=30`)
      .set("Authorization", `Bearer ${managerAuth.token}`);

    expect(auditLogsResponse.status).toBe(200);

    const auditBody = auditLogsResponse.body as AuditLogsResponse;
    const auditActions = auditBody.auditLogs.map((entry) => entry.action);

    expect(auditActions).toEqual(
      expect.arrayContaining([
        "organization.created",
        "organization.theme_updated",
        "election.created",
        "election.office_created",
        "election.candidate_created",
        "election_voter_import.previewed",
        "election_voter_import.committed",
        "election_invite.sent",
        "election_access.claimed",
        "election_session.created",
        "election.status_updated",
        "ballot.submitted"
      ])
    );

    const voterBallotAudit = auditBody.auditLogs.find((entry) => entry.action === "ballot.submitted");
    expect(voterBallotAudit?.actorElectionVoter?.email).toBe(voterEmail);

    const themeAudit = auditBody.auditLogs.find((entry) => entry.action === "organization.theme_updated");
    expect(themeAudit?.actorUser?.email).toBe(managerEmail);
  }, INTEGRATION_TIMEOUT_MS);
});
