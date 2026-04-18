import "dotenv/config";

process.env.NODE_ENV = process.env.NODE_ENV || "test";

import { PrismaClient } from "@prisma/client";
import request from "supertest";

import { app } from "../src/app";

type ApiResponse<T> = {
  body: T;
  status: number;
};

type RegisterResponse = {
  token: string;
  user: {
    id: string;
    email: string;
  };
};

type OrganizationResponse = {
  organization: {
    id: string;
    name: string;
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
    votes: Array<{
      officeId: string;
      candidateId: string;
    }>;
  };
};

type ResultsResponse = {
  offices: Array<{
    officeId: string;
    totalVotes: number;
    candidates: Array<{
      candidateId: string;
      votes: number;
    }>;
  }>;
};

type InviteSendResponse = {
  sent: Array<{
    claimToken?: string;
  }>;
};

const prisma = new PrismaClient();

function logStep(message: string): void {
  console.log(`\n[smoke] ${message}`);
}

function assertStatus<T>(
  response: ApiResponse<T>,
  expectedStatus: number,
  context: string
): asserts response is ApiResponse<T> {
  if (response.status !== expectedStatus) {
    throw new Error(`${context} failed with status ${response.status}: ${JSON.stringify(response.body)}`);
  }
}

async function main() {
  logStep("Connecting to database");
  await prisma.$connect();

  const suffix = Date.now();
  const managerEmail = `smoke-admin-${suffix}@myvapp.local`;
  const managerPassword = "SmokePass1";
  const voterEmail = `smoke-voter-${suffix}@myvapp.local`;
  const voterMemberId = `MEM-${suffix}`;
  const organizationName = `Smoke Organization ${suffix}`;
  const electionTitle = `Executive Election ${suffix}`;

  logStep("Registering a smoke admin user");
  const registerResponse = await request(app).post("/api/v1/auth/register").send({
    firstName: "Smoke",
    lastName: "Admin",
    email: managerEmail,
    password: managerPassword
  });

  assertStatus(registerResponse, 201, "Register");

  const registerBody = registerResponse.body as RegisterResponse;
  const managerToken = registerBody.token;

  logStep("Creating an organization");
  const organizationResponse = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${managerToken}`)
    .send({
      name: organizationName,
      description: "Smoke-test organization"
    });

  assertStatus(organizationResponse, 201, "Create organization");

  const organizationBody = organizationResponse.body as OrganizationResponse;
  const organizationId = organizationBody.organization.id;

  logStep("Creating an election");
  const electionResponse = await request(app)
    .post(`/api/v1/organizations/${organizationId}/elections`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({
      title: electionTitle,
      description: "Smoke-test election",
      startsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      endsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    });

  assertStatus(electionResponse, 201, "Create election");

  const electionBody = electionResponse.body as ElectionResponse;
  const electionId = electionBody.election.id;
  const electionPublicSlug = electionBody.election.publicSlug;

  logStep("Creating an office");
  const officeResponse = await request(app)
    .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/offices`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({
      title: "President",
      seats: 1,
      sortOrder: 0
    });

  assertStatus(officeResponse, 201, "Create office");

  const officeBody = officeResponse.body as OfficeResponse;
  const officeId = officeBody.office.id;

  logStep("Creating two candidates");
  const firstCandidateResponse = await request(app)
    .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/offices/${officeId}/candidates`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({
      displayName: "Ada Okafor",
      bio: "Candidate one"
    });

  assertStatus(firstCandidateResponse, 201, "Create first candidate");

  const secondCandidateResponse = await request(app)
    .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/offices/${officeId}/candidates`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({
      displayName: "Tunde Bello",
      bio: "Candidate two"
    });

  assertStatus(secondCandidateResponse, 201, "Create second candidate");

  const firstCandidateBody = firstCandidateResponse.body as CandidateResponse;
  const secondCandidateBody = secondCandidateResponse.body as CandidateResponse;

  logStep("Previewing voter registry import");
  const previewResponse = await request(app)
    .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/eligibility-imports/preview`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({
      filename: "smoke-voter-registry.csv",
      format: "CSV",
      contentBase64: Buffer.from(
        `member_unique_id,full_name,age,email\n${voterMemberId},Smoke Voter,31,${voterEmail}\n`
      ).toString("base64")
    });

  assertStatus(previewResponse, 201, "Preview voter registry import");
  const importId = previewResponse.body.importId as string;

  logStep("Committing voter registry import");
  const commitResponse = await request(app)
    .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/eligibility-imports/${importId}/commit`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({
      note: "Smoke test import"
    });

  assertStatus(commitResponse, 200, "Commit voter registry import");

  logStep("Sending voter invite");
  const inviteResponse = await request(app)
    .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/invitations/send`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({});

  assertStatus(inviteResponse, 202, "Send voter invite");

  const inviteBody = inviteResponse.body as InviteSendResponse;
  const claimToken = inviteBody.sent[0]?.claimToken;

  if (!claimToken) {
    throw new Error("Expected a test-only claim token in the invite response.");
  }

  logStep("Claiming voter access");
  const claimResponse = await request(app)
    .post(`/api/v1/public/elections/${electionPublicSlug}/claim`)
    .send({
      token: claimToken,
      memberUniqueId: voterMemberId
    });

  assertStatus(claimResponse, 200, "Claim voter invite");
  const voterToken = claimResponse.body.token as string;

  logStep("Opening the election");
  const openElectionResponse = await request(app)
    .patch(`/api/v1/organizations/${organizationId}/elections/${electionId}/status`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({
      status: "OPEN"
    });

  assertStatus(openElectionResponse, 200, "Open election");

  logStep("Fetching the ballot as the claimed voter");
  const ballotFetchResponse = await request(app)
    .get(`/api/v1/organizations/${organizationId}/elections/${electionId}/ballot`)
    .set("Authorization", `Bearer ${voterToken}`);

  assertStatus(ballotFetchResponse, 200, "Fetch ballot");

  logStep("Submitting the ballot");
  const ballotSubmitResponse = await request(app)
    .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/ballot`)
    .set("Authorization", `Bearer ${voterToken}`)
    .send({
      selections: [
        {
          officeId,
          candidateId: firstCandidateBody.candidate.id
        }
      ]
    });

  assertStatus(ballotSubmitResponse, 201, "Submit ballot");

  const ballotBody = ballotSubmitResponse.body as BallotResponse;

  if (ballotBody.ballot.votes.length !== 1) {
    throw new Error("Expected exactly one vote in the submitted ballot.");
  }

  logStep("Checking that manager tallies stay hidden while voting is open");
  const openResultsResponse = await request(app)
    .get(`/api/v1/organizations/${organizationId}/elections/${electionId}/results`)
    .set("Authorization", `Bearer ${managerToken}`);

  assertStatus(openResultsResponse, 403, "Block open-election manager results");

  logStep("Closing the election");
  const closeElectionResponse = await request(app)
    .patch(`/api/v1/organizations/${organizationId}/elections/${electionId}/status`)
    .set("Authorization", `Bearer ${managerToken}`)
    .send({
      status: "CLOSED"
    });

  assertStatus(closeElectionResponse, 200, "Close election");

  logStep("Fetching manager results after close");
  const resultsResponse = await request(app)
    .get(`/api/v1/organizations/${organizationId}/elections/${electionId}/results`)
    .set("Authorization", `Bearer ${managerToken}`);

  assertStatus(resultsResponse, 200, "Fetch closed-election results");

  const resultsBody = resultsResponse.body as ResultsResponse;
  const officeResults = resultsBody.offices.find((office) => office.officeId === officeId);

  if (!officeResults) {
    throw new Error("Expected office results for the created office.");
  }

  const winningCandidate = officeResults.candidates.find(
    (candidate) => candidate.candidateId === firstCandidateBody.candidate.id
  );

  if (!winningCandidate || winningCandidate.votes !== 1) {
    throw new Error("Expected the selected candidate to receive exactly one vote.");
  }

  const losingCandidate = officeResults.candidates.find(
    (candidate) => candidate.candidateId === secondCandidateBody.candidate.id
  );

  if (!losingCandidate || losingCandidate.votes !== 0) {
    throw new Error("Expected the unselected candidate to receive zero votes.");
  }

  logStep("Fetching public results after close");
  const publicResultsResponse = await request(app).get(
    `/api/v1/public/elections/${electionPublicSlug}/results`
  );

  assertStatus(publicResultsResponse, 200, "Fetch public results");

  logStep("Smoke flow completed successfully");
  console.log(
    JSON.stringify(
      {
        managerEmail,
        voterEmail,
        organizationId,
        electionId,
        officeId,
        selectedCandidateId: firstCandidateBody.candidate.id,
        ballotId: ballotBody.ballot.id
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("\n[smoke] Smoke test failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
