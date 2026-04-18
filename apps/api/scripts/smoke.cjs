process.env.NODE_ENV = process.env.NODE_ENV || "test";

const request = require("supertest");
let prisma;

function logStep(message) {
  console.log(`\n[smoke] ${message}`);
}

function assertStatus(response, expectedStatus, context) {
  if (response.status !== expectedStatus) {
    throw new Error(`${context} failed with status ${response.status}: ${JSON.stringify(response.body)}`);
  }
}

async function main() {
  logStep("Connecting to database");
  const { PrismaClient } = require("@prisma/client");
  prisma = new PrismaClient();
  await prisma.$connect();

  const suffix = Date.now();
  const managerEmail = `smoke-admin-${suffix}@myvapp.local`;
  const managerPassword = "SmokePass1";
  const voterEmail = `smoke-voter-${suffix}@myvapp.local`;
  const voterMemberId = `MEM-${suffix}`;
  const organizationName = `Smoke Organization ${suffix}`;
  const electionTitle = `Executive Election ${suffix}`;

  logStep("Loading built API app");
  const { app } = require("../dist/src/app.js");

  logStep("Registering a smoke admin user");
  const registerResponse = await request(app).post("/api/v1/auth/register").send({
    firstName: "Smoke",
    lastName: "Admin",
    email: managerEmail,
    password: managerPassword
  });

  assertStatus(registerResponse, 201, "Register");
  const managerToken = registerResponse.body.token;

  logStep("Creating an organization");
  const organizationResponse = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${managerToken}`)
    .send({
      name: organizationName,
      description: "Smoke-test organization"
    });

  assertStatus(organizationResponse, 201, "Create organization");
  const organizationId = organizationResponse.body.organization.id;

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
  const electionId = electionResponse.body.election.id;
  const electionPublicSlug = electionResponse.body.election.publicSlug;

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
  const officeId = officeResponse.body.office.id;

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
  const firstCandidateId = firstCandidateResponse.body.candidate.id;
  const secondCandidateId = secondCandidateResponse.body.candidate.id;

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
  const importId = previewResponse.body.importId;

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
  const claimToken = inviteResponse.body.sent?.[0]?.claimToken;

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
  const voterToken = claimResponse.body.token;

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
          candidateId: firstCandidateId
        }
      ]
    });

  assertStatus(ballotSubmitResponse, 201, "Submit ballot");

  if (ballotSubmitResponse.body.ballot.votes.length !== 1) {
    throw new Error("Expected exactly one vote in the submitted ballot.");
  }

  logStep("Verifying manager tallies stay hidden while voting is open");
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
  const officeResults = resultsResponse.body.offices.find((office) => office.officeId === officeId);

  if (!officeResults) {
    throw new Error("Expected office results for the created office.");
  }

  const winningCandidate = officeResults.candidates.find(
    (candidate) => candidate.candidateId === firstCandidateId
  );

  if (!winningCandidate || winningCandidate.votes !== 1) {
    throw new Error("Expected the selected candidate to receive exactly one vote.");
  }

  const losingCandidate = officeResults.candidates.find(
    (candidate) => candidate.candidateId === secondCandidateId
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
        selectedCandidateId: firstCandidateId,
        ballotId: ballotSubmitResponse.body.ballot.id
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
    try {
      if (prisma) {
        await prisma.$disconnect();
      }
    } catch {
      // Ignore cleanup errors in smoke mode.
    }
  });
