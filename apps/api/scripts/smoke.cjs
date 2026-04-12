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
  const email = `smoke-admin-${suffix}@myvapp.local`;
  const password = "SmokePass1";
  const organizationName = `Smoke Organization ${suffix}`;
  const electionTitle = `Executive Election ${suffix}`;

  logStep("Loading built API app");
  const { app } = require("../dist/src/app.js");

  logStep("Registering a smoke admin user");
  const registerResponse = await request(app).post("/api/v1/auth/register").send({
    firstName: "Smoke",
    lastName: "Admin",
    email,
    password
  });

  assertStatus(registerResponse, 201, "Register");
  const token = registerResponse.body.token;

  logStep("Creating an organization");
  const organizationResponse = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: organizationName,
      description: "Smoke-test organization"
    });

  assertStatus(organizationResponse, 201, "Create organization");
  const organizationId = organizationResponse.body.organization.id;

  logStep("Creating an election");
  const electionResponse = await request(app)
    .post(`/api/v1/organizations/${organizationId}/elections`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      title: electionTitle,
      description: "Smoke-test election"
    });

  assertStatus(electionResponse, 201, "Create election");
  const electionId = electionResponse.body.election.id;

  logStep("Creating an office");
  const officeResponse = await request(app)
    .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/offices`)
    .set("Authorization", `Bearer ${token}`)
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
    .set("Authorization", `Bearer ${token}`)
    .send({
      displayName: "Ada Okafor",
      bio: "Candidate one"
    });

  assertStatus(firstCandidateResponse, 201, "Create first candidate");

  const secondCandidateResponse = await request(app)
    .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/offices/${officeId}/candidates`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      displayName: "Tunde Bello",
      bio: "Candidate two"
    });

  assertStatus(secondCandidateResponse, 201, "Create second candidate");
  const firstCandidateId = firstCandidateResponse.body.candidate.id;
  const secondCandidateId = secondCandidateResponse.body.candidate.id;

  logStep("Opening the election");
  const openElectionResponse = await request(app)
    .patch(`/api/v1/organizations/${organizationId}/elections/${electionId}/status`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      status: "OPEN"
    });

  assertStatus(openElectionResponse, 200, "Open election");

  logStep("Fetching the ballot");
  const ballotFetchResponse = await request(app)
    .get(`/api/v1/organizations/${organizationId}/elections/${electionId}/ballot`)
    .set("Authorization", `Bearer ${token}`);

  assertStatus(ballotFetchResponse, 200, "Fetch ballot");

  logStep("Submitting the ballot");
  const ballotSubmitResponse = await request(app)
    .post(`/api/v1/organizations/${organizationId}/elections/${electionId}/ballot`)
    .set("Authorization", `Bearer ${token}`)
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

  logStep("Fetching manager results");
  const resultsResponse = await request(app)
    .get(`/api/v1/organizations/${organizationId}/elections/${electionId}/results`)
    .set("Authorization", `Bearer ${token}`);

  assertStatus(resultsResponse, 200, "Fetch results");
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

  logStep("Smoke flow completed successfully");
  console.log(
    JSON.stringify(
      {
        email,
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
