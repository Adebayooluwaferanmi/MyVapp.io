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

type MemberResponse = {
  invited: boolean;
  temporaryPassword: string | null;
  member: {
    id: string;
    role: string;
    user: {
      id: string;
      email: string;
      role: string;
      status: string;
    };
  };
};

type BallotResponse = {
  ballot: {
    id: string;
    votes: Array<{
      officeId: string;
      candidateId: string;
    }>;
  };
};

type AuditLogsResponse = {
  auditLogs: Array<{
    action: string;
    actor: {
      email: string;
    };
    metadata: Record<string, unknown> | null;
  }>;
};

const runDbTests = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!runDbTests)("manager to voter election flow", () => {
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

  it("covers organization setup, voter ballot submission, results, and audit trail", async () => {
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

    const inviteVoterResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/members`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        firstName: "Voter",
        lastName: "Tester",
        email: voterEmail,
        role: "VOTER"
      });

    expect(inviteVoterResponse.status).toBe(201);

    const memberBody = inviteVoterResponse.body as MemberResponse;
    expect(memberBody.invited).toBe(true);
    expect(memberBody.temporaryPassword).toBeTruthy();
    expect(memberBody.member.user.email).toBe(voterEmail);
    expect(memberBody.member.user.role).toBe("VOTER");
    expect(memberBody.member.user.status).toBe("INVITED");

    const voterLoginResponse = await request(app).post("/api/v1/auth/login").send({
      email: voterEmail,
      password: memberBody.temporaryPassword
    });

    expect(voterLoginResponse.status).toBe(200);

    const voterAuth = voterLoginResponse.body as AuthResponse;

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
    expect((managerThemePatchResponse.body as OrganizationResponse).organization.themeOverrides).toMatchObject({
      primary: "#c2410c",
      accent: "#ea580c"
    });

    const createElectionResponse = await request(app)
      .post(`/api/v1/organizations/${organizationId}/elections`)
      .set("Authorization", `Bearer ${managerAuth.token}`)
      .send({
        title: electionTitle,
        description: "Integration flow election"
      });

    expect(createElectionResponse.status).toBe(201);

    const electionBody = createElectionResponse.body as ElectionResponse;
    const electionId = electionBody.election.id;

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

    expect(duplicateBallotResponse.status).toBe(409);
    expect(duplicateBallotResponse.body.message).toContain("already submitted");

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

    const auditLogsResponse = await request(app)
      .get(`/api/v1/organizations/${organizationId}/audit-logs?limit=20`)
      .set("Authorization", `Bearer ${managerAuth.token}`);

    expect(auditLogsResponse.status).toBe(200);

    const auditBody = auditLogsResponse.body as AuditLogsResponse;
    const auditActions = auditBody.auditLogs.map((entry) => entry.action);

    expect(auditActions).toEqual(
      expect.arrayContaining([
        "organization.created",
        "organization.member_added",
        "organization.theme_updated",
        "election.created",
        "election.office_created",
        "election.candidate_created",
        "election.status_updated",
        "ballot.submitted"
      ])
    );

    const voterBallotAudit = auditBody.auditLogs.find((entry) => entry.action === "ballot.submitted");
    expect(voterBallotAudit?.actor.email).toBe(voterEmail);
    expect(voterBallotAudit?.metadata).toMatchObject({
      electionId,
      selectionCount: 1
    });

    const themeAudit = auditBody.auditLogs.find((entry) => entry.action === "organization.theme_updated");
    expect(themeAudit?.actor.email).toBe(managerEmail);
    expect(themeAudit?.metadata).toMatchObject({
      themePreset: "sunrise-coral"
    });
  }, 30_000);
});
