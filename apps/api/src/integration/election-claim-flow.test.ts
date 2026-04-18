import { resolve } from "node:path";

import type { Express } from "express";

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const inviteToken = "claim-token-for-integration-flow-0001";

vi.mock("../modules/eligibility/eligibility.tokens", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../modules/eligibility/eligibility.tokens")>();

  return {
    ...actual,
    generateElectionInviteToken() {
      return inviteToken;
    }
  };
});

dotenv.config({ path: resolve(process.cwd(), "../../.env") });

type AuthResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
};

const runDbTests = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!runDbTests)("election claim flow", () => {
  let app: Express;
  let prisma: PrismaClient;

  const suffix = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  const managerEmail = `claim-manager-${suffix}@myvapp.local`;
  const voterEmail = `claim-voter-${suffix}@myvapp.local`;
  const managerPassword = "ClaimFlowPass1!";
  const organizationName = `Claim Flow Org ${suffix}`;
  const electionTitle = `Claim Flow Election ${suffix}`;

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
  }, 30_000);

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
  }, 30_000);

  it("supports registry invite claim, voter-only election access, and post-close results", async () => {
    const registerManagerResponse = await request(app).post("/api/v1/auth/register").send({
      firstName: "Claim",
      lastName: "Manager",
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
        description: "Claim flow integration test organization"
      });

    expect(organizationResponse.status).toBe(201);
    organizationId = organizationResponse.body.organization.id as string;

    const createElectionResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        title: electionTitle,
        description: "Election created for invite claim flow",
        startsAt: "2026-05-10T09:00:00.000Z",
        endsAt: "2026-05-12T17:00:00.000Z"
      });

    expect(createElectionResponse.status).toBe(201);
    const election = createElectionResponse.body.election as {
      id: string;
      publicSlug: string;
    };

    const createOfficeResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${election.id}/offices`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        title: "President",
        description: "Lead office",
        seats: 1,
        sortOrder: 0
      });

    expect(createOfficeResponse.status).toBe(201);
    const officeId = createOfficeResponse.body.office.id as string;

    const firstCandidateResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${election.id}/offices/${officeId}/candidates`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        displayName: "Ada Claim",
        bio: "Candidate one"
      });

    const secondCandidateResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${election.id}/offices/${officeId}/candidates`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        displayName: "Bola Claim",
        bio: "Candidate two"
      });

    expect(firstCandidateResponse.status).toBe(201);
    expect(secondCandidateResponse.status).toBe(201);

    const previewResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${election.id}/eligibility-imports/preview`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        filename: "voter-registry.csv",
        format: "CSV",
        contentBase64: Buffer.from(
          "member_unique_id,full_name,age,email\nMEM-001,Claim Voter,31," + voterEmail + "\n"
        ).toString("base64")
      });

    expect(previewResponse.status).toBe(201);
    expect(previewResponse.body.summary).toMatchObject({
      acceptedCount: 1,
      rejectedCount: 0
    });

    const importId = previewResponse.body.importId as string;

    const commitResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${election.id}/eligibility-imports/${importId}/commit`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        note: "Committed by integration test"
      });

    expect(commitResponse.status).toBe(200);
    expect(commitResponse.body.committedCount).toBe(1);

    const sendInvitesResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${election.id}/invitations/send`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({});

    expect(sendInvitesResponse.status).toBe(202);
    expect(sendInvitesResponse.body.sentCount).toBe(1);

    const claimContextResponse = await request(app).get(
      `/api/v1/public/elections/${election.publicSlug}/claim-context?token=${inviteToken}`
    );

    expect(claimContextResponse.status).toBe(200);
    expect(claimContextResponse.body.invite).toMatchObject({
      canClaim: true,
      status: "ACTIVE",
      email: voterEmail
    });

    const claimResponse = await request(app)
      .post(`/api/v1/public/elections/${election.publicSlug}/claim`)
      .send({
        token: inviteToken,
        memberUniqueId: "MEM-001"
      });

    expect(claimResponse.status).toBe(200);
    const voterAuth = claimResponse.body as AuthResponse;
    expect(voterAuth.user.email).toBe(voterEmail);
    expect(voterAuth.user.role).toBe("VOTER");

    const voterOrganizationsResponse = await request(app)
      .get("/api/v1/organizations")
      .set("Authorization", `Bearer ${voterAuth.token}`);

    expect(voterOrganizationsResponse.status).toBe(200);
    expect(voterOrganizationsResponse.body.organizations).toHaveLength(1);

    const voterElectionsResponse = await request(app)
      .get(`/api/v1/organizations/${organizationId}/elections`)
      .set("Authorization", `Bearer ${voterAuth.token}`);

    expect(voterElectionsResponse.status).toBe(200);
    expect(voterElectionsResponse.body.elections).toHaveLength(1);

    const preOpenBallotResponse = await request(app)
      .get(`/api/v1/organizations/${organizationId}/elections/${election.id}/ballot`)
      .set("Authorization", `Bearer ${voterAuth.token}`);

    expect(preOpenBallotResponse.status).toBe(200);
    expect(preOpenBallotResponse.body.election.status).toBe("DRAFT");

    const openElectionResponse = await request(app)
      .patch(`/api/v1/organizations/${organizationId}/elections/${election.id}/status`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        status: "OPEN"
      });

    expect(openElectionResponse.status).toBe(200);

    const hiddenResultsResponse = await request(app)
      .get(`/api/v1/organizations/${organizationId}/elections/${election.id}/results`)
      .set("Authorization", `Bearer ${voterAuth.token}`);

    expect(hiddenResultsResponse.status).toBe(403);

    const submitBallotResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections/${election.id}/ballot`)
      .set("Authorization", `Bearer ${voterAuth.token}`)
      .send({
        selections: [
          {
            officeId,
            candidateId: firstCandidateResponse.body.candidate.id
          }
        ]
      });

    expect(submitBallotResponse.status).toBe(201);

    const openManagerResultsResponse = await request(app)
      .get(`/api/v1/organizations/${organizationId}/elections/${election.id}/results`)
      .set("Authorization", `Bearer ${managerAuth.token}`);

    expect(openManagerResultsResponse.status).toBe(403);

    const closeElectionResponse = await request(app)
      .patch(`/api/v1/organizations/${organizationId}/elections/${election.id}/status`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        status: "CLOSED"
      });

    expect(closeElectionResponse.status).toBe(200);

    const voterResultsResponse = await request(app)
      .get(`/api/v1/organizations/${organizationId}/elections/${election.id}/results`)
      .set("Authorization", `Bearer ${voterAuth.token}`);

    expect(voterResultsResponse.status).toBe(200);
    expect(voterResultsResponse.body.offices).toHaveLength(1);
    expect(voterResultsResponse.body.offices[0]?.candidates[0]?.votes).toBe(1);

    const auditLogsResponse = await request(app)
      .get(`/api/v1/organizations/${organizationId}/audit-logs?limit=25`)
      .set("Authorization", `Bearer ${managerAuth.token}`);

    expect(auditLogsResponse.status).toBe(200);
    expect(
      auditLogsResponse.body.auditLogs.map((entry: { action: string }) => entry.action)
    ).toEqual(expect.arrayContaining(["eligibility_import.committed", "eligibility_invite.sent", "eligibility_invite.claimed", "ballot.submitted"]));
  }, 30_000);
});
