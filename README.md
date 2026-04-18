# MyVapp

MyVapp is a multi-tenant election administration platform for organizations that need a controlled, auditable, and trustworthy way to run internal elections.

MyVapp is not an open self-registration voting app.

- A TypeScript Express API with register, login, JWT auth, and bcrypt password hashing
- A PostgreSQL schema for users, organizations, elections, offices, candidates, ballots, and votes
- A React frontend workspace for admins and voters
- Dockerfiles for the API and frontend
- A `compose.yml` stack for PostgreSQL, API, and web
- Environment variable templates
- Organization, election, office, and candidate admin endpoints
- Organization member invite/add flows with per-organization roles
- Election status, ballot submission, and result tally endpoints
- Election-scoped theme presets for organizations
- Election-scoped voter registry preview, eligibility roster, and manual invite delivery
- Architecture and setup documentation
The platform is built for groups, associations, unions, schools, faith communities, clubs, alumni bodies, cooperatives, and other organizations that need structured election operations with controlled voter eligibility.

## What MyVapp does

MyVapp runs elections through a controlled operational flow:

- an organization-wide manager creates and configures an election
- the election window, structure, and policies are defined before voting begins
- the approved voter roll is imported through CSV
- invite links are previewed and sent to eligible voters
- voters activate temporary election-scoped access through one-time invite links
- voters participate only within the configured election period
- election operations are auditable
- result visibility follows election policy

## Core product rules

The following rules define MyVapp:

### Access model

- voter access is election-scoped
- invite links are one-time use
- voter access comes from an approved voter roll
- voter participation does not depend on open public registration
- managers are organization-wide

### Invite behavior

- bulk invite sending is supported
- individual resend is supported
- invite preview is required before sending
- individual resend supports searching for a specific voter email

### Session behavior

- a voter can access from multiple devices
- only one final ballot submission is allowed
- prior active session invalidation on new login is configurable per election

### Result visibility

## Voter registry roadmap

MyVapp is moving toward a more secure election-access model that separates:

- organization membership for managers and operators
- election eligibility for actual voter access

The workflow being introduced is:

1. A manager creates an election for the association.
2. The manager imports an approved voter registry from `CSV` or `XLSX`.
3. The system validates the registry and persists election-scoped eligibility records.
4. The system sends one-time claim links to eligible voters by email.
5. Each voter claims access with the emailed link plus their `member_unique_id`.
6. Claimed voters can vote once during the election window.
7. Candidate tallies stay hidden until the election closes.

This is intentionally safer than handing out a reusable “voting ID” that could be forwarded or reused outside the intended election context.

## Proposed folder structure
- results can be visible while the election is open
- result visibility is configurable per election
- live result visibility is limited to authorized roles such as chair and observer, based on election policy

### Operational features

- CSV import with downloadable error report
- election dashboard with total voters imported, invites sent, invites activated, ballots cast, and turnout percentage
- audit trail
- election lock after opening
- exportable voter roll
- exportable results
- ballot receipt reference without exposing vote content
- tamper-evident audit support in a later phase

## Repository structure

```text
.
├── apps
│   ├── api
│   │   ├── prisma
│   │   └── src
│   │       ├── config
│   │       ├── lib
│   │       ├── middlewares
│   │       ├── modules
│   │       ├── routes
│   │       └── types
│   └── web
│       └── src
├── docs
├── .env.example
└── compose.yml
```

## Why the repository is structured this way

- `apps/api` contains election rules, access control, integrity checks, and backend services
- `apps/web` contains the frontend for administrators, observers, and voters
- `modules` inside the API are organized by domain capability
- `prisma` owns the relational schema and seed flow
- `docs` contains architecture, implementation, and operational documentation

This structure reflects the product itself. Election systems expand through clear domain boundaries, not through a flat codebase.

## Backend direction

The backend is organized around domain responsibilities.

The core direction is:

```text
modules
├── auth
├── organizations
├── elections
├── ballots
├── election-voters
├── election-invites
├── election-access
├── imports
├── exports
├── dashboard
└── audit
```

### Existing modules

- `auth`, for platform and organization-level users
- `organizations`
- `elections`
- `ballots`

### New modules in the election-scoped model

- `election-voters`
- `election-invites`
- `election-access`
- `imports`
- `exports`
- `dashboard`
- `audit`

## Tech stack

- Backend: Node.js, TypeScript, Express, Prisma, PostgreSQL
- Auth for managers and platform users: JWT access tokens, bcrypt password hashing
- Frontend: React, TypeScript, Vite
- Infrastructure: Docker, Docker Compose, Nginx for static frontend hosting

## Current system baseline

The current repository already includes:

- a TypeScript Express API
- JWT-based authentication for platform and organization-level users
- a PostgreSQL schema for organizations, elections, offices, candidates, ballots, and votes
- a React frontend workspace
- Dockerfiles for the API and frontend
- a `compose.yml` stack for PostgreSQL, API, and web
- environment variable templates
- backend endpoints for organization, election, office, candidate, ballot, and result flows
- architecture and setup documentation

This is the current baseline. The product direction now moves from generic org-member voting toward election-scoped access and controlled voter-roll operations.

## Branch workflow

Development happens on `dev`.

- active development branch: `dev`
- merge target branch: `main`
- merge policy: only merge `dev` into `main` after tests pass and the feature set has been manually smoke-tested

## CI/CD

GitHub Actions runs CI from `.github/workflows/ci.yml`.

It runs on:

- pull requests into `main`
- pushes to `dev`
- pushes to `main`

The workflow verifies:

- API unit tests
- API TypeScript build
- frontend production build
- Prisma schema push against a Postgres service
- seeded smoke flow against the built API

GitHub Actions also runs a release workflow from `.github/workflows/release.yml`.

It runs when a semantic version tag such as `v0.1.1` is pushed.

The release workflow:

- installs dependencies
- runs API tests
- builds the frontend
- pushes the Prisma schema to Postgres
- seeds demo data
- runs the smoke flow
- publishes a GitHub release with generated notes and bundled API and web build artifacts

## Release process

Release from `main` after CI is green:

```bash
git checkout main
git pull origin main
git tag v0.1.1
git push origin v0.1.1
```

## Environment setup

Copy the environment template:

```bash
cp .env.example .env
```

Review and update the values before real use:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `AUTH_RATE_LIMIT_WINDOW_MS`
- `AUTH_RATE_LIMIT_MAX`
- `BALLOT_RATE_LIMIT_WINDOW_MS`
- `BALLOT_RATE_LIMIT_MAX`
- `SEED_ADMIN_PASSWORD`
- `CLIENT_URL`
- `CORS_ORIGIN`
- `VITE_API_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`

## Run with Docker Compose

```bash
docker compose -f compose.yml up --build
```

Services:

- Frontend: `http://localhost:8080`
- API: `http://localhost:4000/api/v1`
- Health endpoint: `http://localhost:4000/api/v1/health`
- PostgreSQL: `localhost:5432`

## Run without Docker

### Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL 16+

### Backend

```bash
cd apps/api
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

### Frontend

```bash
cd apps/web
npm install
npm run dev
```

For local non-Docker development, update `DATABASE_URL` in `.env` to point to your local PostgreSQL instance, usually `localhost` instead of `postgres`.

## Workspace commands

From the repo root:

```bash
npm install
npm run db:setup
npm run dev:api
npm run dev:web
npm test
```

`npm run db:setup` prepares a usable demo workspace. It generates the Prisma client, pushes the schema, and seeds demo data.

## Demo accounts after seeding

With the default `.env.example` values, these accounts are created automatically:

- Platform admin: `admin@myvapp.local` / `ChangeMe123!`
- Organization manager: `manager@myvapp.local` / `ChangeMe123!`
- Demo voter: `voter1@myvapp.local` / `ChangeMe123!`
- Additional seeded voters: `voter2@myvapp.local`, `voter3@myvapp.local` / `ChangeMe123!`

These accounts exist to verify the current baseline application behavior.

## Current API baseline

Ballot access is now restricted to eligible members only. A user must belong to the organization with one of these roles to open or submit a ballot:

- `OWNER`
- `ADMIN`
- `VOTER`

## Election-scoped voter eligibility

The next voting-security layer is election-scoped eligibility, which is now active in the API and manager workspace:

- `ElectionEligibilityImportJob` represents an import preview or committed eligibility batch.
- `ElectionEligibility` represents one approved voter for one election.
- `ElectionInvite` represents a one-time invite token for that election-scoped eligibility record.

The current API surface includes:

- `POST /organizations/:organizationId/elections/:electionId/eligibility-imports/preview`
- `POST /organizations/:organizationId/elections/:electionId/eligibility-imports/:importId/commit`
- `GET /organizations/:organizationId/elections/:electionId/eligibility`
- `POST /organizations/:organizationId/elections/:electionId/invitations/send`
- `POST /organizations/:organizationId/elections/:electionId/invitations/:eligibilityId/resend`
- `GET /public/elections/:electionSlug/claim-context?token=...`
- `POST /public/elections/:electionSlug/claim`

What is available now:

- the roster endpoint is live and returns the current election-scoped eligibility view
- import preview accepts `CSV` and `XLSX`, validates rows, and persists a preview job
- import commit writes the accepted rows into election eligibility records
- invitation send/resend creates one-time invite tokens and delivers them through SMTP configuration
- the manager workspace includes voter registry preview, commit, roster filtering, turnout summary, and manual send/resend controls
- public claim endpoints remain reserved for the next milestone and still return `501 Not Implemented`

## Result visibility policy

For election-specific voter registry flows, MyVapp is adopting a safer publication policy:

- during `OPEN` elections, managers can monitor turnout only
- during `OPEN` elections, no one can see candidate tallies
- after the election is `CLOSED` or `ARCHIVED`, candidate results can be published

This avoids influencing active voters with live poll swings or bandwagon effects.

## Audit and security layer

The platform now includes a first security-hardening slice:

- in-memory rate limiting for `register`, `login`, and ballot-access endpoints
- persisted audit logs for:
  - organization creation
  - member invite/add
  - member role updates
  - election creation
  - election status changes
  - office creation
  - candidate creation
  - ballot submission
- manager-only audit log access per organization

Important privacy rule:

- ballot audit logs intentionally do not store the voter’s candidate selections
- only submission metadata such as election ID and selection count is recorded

## Live smoke test

For a real database-backed verification run, use Postgres in Docker and the API smoke script:

1. Start a Postgres container:

```bash
/usr/bin/docker run -d --name myvapp-postgres-smoke \
  -e POSTGRES_DB=myvapp_smoke \
  -e POSTGRES_USER=myvapp_user \
  -e POSTGRES_PASSWORD=change_me \
  -p 54329:5432 \
  --health-cmd='pg_isready -U myvapp_user -d myvapp_smoke' \
  --health-interval=2s \
  --health-timeout=5s \
  --health-retries=30 \
  postgres:16-alpine
```

2. Push the schema:

```bash
DATABASE_URL='postgresql://myvapp_user:change_me@127.0.0.1:54329/myvapp_smoke?schema=public' \
./node_modules/.bin/prisma db push --schema apps/api/prisma/schema.prisma
```

3. Build the API:

```bash
PATH=/home/alixa/.nvm/versions/node/v20.20.2/bin:$PATH \
/home/alixa/.nvm/versions/node/v20.20.2/bin/node \
/home/alixa/.nvm/versions/node/v20.20.2/lib/node_modules/npm/bin/npm-cli.js \
--workspace @myvapp/api run build
```

4. Run the smoke workflow:

```bash
PATH=/home/alixa/.nvm/versions/node/v20.20.2/bin:$PATH \
DATABASE_URL='postgresql://myvapp_user:change_me@127.0.0.1:54329/myvapp_smoke?schema=public' \
JWT_SECRET='replace_this_with_a_long_random_secret_at_least_32_characters' \
CLIENT_URL='http://localhost:8080' \
CORS_ORIGIN='http://localhost:8080' \
/home/alixa/.nvm/versions/node/v20.20.2/bin/node apps/api/scripts/smoke.cjs
```

The smoke script verifies:

- user registration
- organization creation
- election creation
- office creation
- candidate creation
- election opening
- ballot retrieval
- ballot submission
- manager result tally retrieval

## Frontend status

The frontend is now a real working workspace rather than only a login page. It currently supports:

- register and login
- organization selection
- election creation and status control
- office and candidate creation
- ballot casting for open elections
- manager-facing result tallies

## API starter endpoints
The current API exposes these baseline routes:

- `GET /api/v1`
- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/organizations`
- `POST /api/v1/organizations`
- `GET /api/v1/organizations/:organizationId`
- `GET /api/v1/organizations/:organizationId/members`
- `POST /api/v1/organizations/:organizationId/members`
- `PATCH /api/v1/organizations/:organizationId/members/:memberId`
- `GET /api/v1/organizations/:organizationId/audit-logs`
- `GET /api/v1/organizations/:organizationId/elections`
- `POST /api/v1/organizations/:organizationId/elections`
- `GET /api/v1/organizations/:organizationId/elections/:electionId`
- `PATCH /api/v1/organizations/:organizationId/elections/:electionId/status`
- `GET /api/v1/organizations/:organizationId/elections/:electionId/offices`
- `POST /api/v1/organizations/:organizationId/elections/:electionId/offices`
- `GET /api/v1/organizations/:organizationId/elections/:electionId/offices/:officeId/candidates`
- `POST /api/v1/organizations/:organizationId/elections/:electionId/offices/:officeId/candidates`
- `GET /api/v1/organizations/:organizationId/elections/:electionId/ballot`
- `POST /api/v1/organizations/:organizationId/elections/:electionId/ballot`
- `GET /api/v1/organizations/:organizationId/elections/:electionId/results`

These routes represent the current scaffold baseline. The next architecture phases extend this toward voter-roll import, invite lifecycle management, election-scoped access, dashboarding, exports, and audit.

## Current database baseline

The current Prisma schema models the following core entities:

- `User`
- `Organization`
- `OrganizationMember`
- `Election`
- `Office`
- `Candidate`
- `Ballot`
- `Vote`

This baseline supports the current scaffold.

The next model expansion adds election-scoped entities such as:

- `ElectionVoter`
- `ElectionInvite`
- `ElectionSession`
- `ElectionAuditLog`

## Current voting flow baseline

The current backend supports this baseline flow:

1. register or log in
2. create an organization
3. create an election under that organization
4. add offices and candidates
5. change the election status to `OPEN`
6. fetch the ballot for the current voter
7. submit one ballot with one candidate per office
8. view manager-facing result tallies

This is the current implementation baseline. The product direction now evolves toward controlled election-scoped participation through imported voter rolls and one-time access links.

## Testing

API unit tests run with Vitest:

```bash
cd apps/api
npm test
```

The current tests cover baseline validation and helper rules such as:

- slug generation
- auth payload validation
- organization payload validation
- election, office, and candidate payload validation
- ballot payload validation

## Docker notes

The current Docker setup follows a clean service split:

- PostgreSQL runs as a separate service with health checks and a persistent volume
- the API image builds TypeScript, generates Prisma client code, and applies schema updates at startup
- the web image builds static assets and serves them through Nginx

## Architecture direction

The next architecture phases are:

1. redesign the database model around election-scoped access
2. add voter CSV import and validation flows
3. add invite preview, send, and resend workflows
4. add election-scoped session activation and access control
5. refactor ballot submission around election-scoped voter identity
6. add dashboard metrics, exports, and audit inspection
7. add deeper security controls and tamper-evident audit support
8. expand automated testing and CI enforcement

## Documentation

For the full system direction, see:

- `docs/architecture.md`

## Summary

MyVapp is a controlled election operations platform.

The system is built around:

- organization-managed elections
- approved voter-roll import
- one-time invite-based access
- temporary election-scoped participation
- one final ballot submission
- configurable result visibility
- auditability and operational trust
