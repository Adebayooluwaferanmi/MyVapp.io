# MyVapp

MyVapp is a voting platform scaffold for groups, organizations, associations, unions, schools, faith communities, and other communities that need a trusted way to elect people into customizable offices.

The current repository started effectively empty, so this scaffold establishes a professional baseline rather than migrating legacy code. It includes:

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
- Milestone 1 contracts for alumni voter registry imports, election invitations, and public claim links
- Architecture and setup documentation

## Product intent

This project is shaped around a real voting domain:

- One platform can serve multiple organizations
- Each organization can define its own election cycles
- Each election can define one or more offices
- Each office can accept candidates and record votes
- Users can belong to organizations with different roles
- Authentication is implemented first so later admin and voter flows sit on a secure base

## Alumni election roadmap

MyVapp is moving toward a more secure alumni-election model that separates:

- organization membership for managers and operators
- election eligibility for actual voter access

The alumni workflow being introduced is:

1. A manager creates an election for the association.
2. The manager imports an approved voter registry from `CSV` or `XLSX`.
3. The system validates the registry and persists election-scoped eligibility records.
4. The system sends one-time claim links to eligible voters by email.
5. Each voter claims access with the emailed link plus their `member_unique_id`.
6. Claimed voters can vote once during the election window.
7. Candidate tallies stay hidden until the election closes.

This is intentionally safer than handing out a reusable “voting ID” that could be forwarded or reused outside the intended election context.

## Proposed folder structure

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
│   │       │   ├── auth
│   │       │   └── health
│   │       ├── routes
│   │       └── types
│   └── web
│       └── src
│           ├── components
│           └── lib
├── docs
├── .env.example
└── compose.yml
```

## Why this structure

- `apps/api` keeps backend concerns isolated and modular.
- `apps/web` gives the frontend its own build and deployment boundary.
- `modules` inside the API are organized by domain capability, which scales better than dumping everything into `controllers` and `services`.
- `prisma` owns the database model and seeding.
- `docs` is where architectural explanations, ADRs, and onboarding docs should live.

As the app grows, the recommended next modules inside `apps/api/src/modules` are:

- `organizations`
- `memberships`
- `elections`
- `offices`
- `candidates`
- `ballots`
- `votes`
- `audit`

## Tech stack

- Backend: Node.js, TypeScript, Express, Prisma, PostgreSQL
- Auth: JWT access tokens, bcrypt password hashing
- Frontend: React, TypeScript, Vite
- Infrastructure: Docker, Docker Compose, Nginx for static frontend hosting

## Branch workflow

Development is now intended to happen on `dev`.

- Active development branch: `dev`
- Merge target branch in this repo: `main`
- Policy: only merge `dev` into `main` after tests pass and the feature set has been manually smoke-tested

If you want the default branch renamed from `main` to `master`, we can do that explicitly later, but the current repo branch is `main`.

## CI/CD

GitHub Actions now runs a CI workflow from [.github/workflows/ci.yml](/mnt/e/Alixa/MyVapp.io/.github/workflows/ci.yml:1).

It runs on:

- pull requests into `main`
- pushes to `dev`
- pushes to `main`

The workflow currently verifies:

- API unit tests
- API TypeScript build
- frontend production build
- Prisma schema push against a Postgres service
- seeded smoke flow against the built API

This gives the project a usable CI gate for branch-based delivery, so `dev` can feed `main` through verified pull requests.

GitHub Actions also now runs a release workflow from [.github/workflows/release.yml](/mnt/e/Alixa/MyVapp.io/.github/workflows/release.yml:1).

It runs when a semantic version tag such as `v0.1.1` is pushed. The release workflow:

- installs dependencies
- runs API tests
- builds the frontend
- pushes the Prisma schema to Postgres
- seeds demo data
- runs the smoke flow
- publishes a GitHub release with generated notes and bundled API/web build artifacts

### Release process

For the current setup, release from `main` after CI is green:

```bash
git checkout main
git pull origin main
git tag v0.1.1
git push origin v0.1.1
```

That tag push triggers the release workflow automatically.

### Branch protection note

I attempted to enable GitHub branch protection for `main`, but GitHub rejected it for this private repository with:

`Upgrade to GitHub Pro or make this repository public to enable this feature.`

So the repo now has CI and automated releases in place, but required status checks on `main` will need either:

- a public repository, or
- a GitHub plan that supports branch protection on private repositories

## Environment setup

1. Copy the env template:

```bash
cp .env.example .env
```

2. Review and change these values before real use:

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

Prerequisites:

- Node.js 20+
- npm 10+
- PostgreSQL 16+

Backend:

```bash
cd apps/api
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Frontend:

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

`npm run db:setup` prepares a usable demo workspace, not just a blank admin account. It generates the Prisma client, pushes the schema, and seeds a demo organization with sample users, elections, offices, candidates, and result data.

## Demo accounts after seeding

With the default `.env.example` values, these accounts are created automatically:

- Platform admin: `admin@myvapp.local` / `ChangeMe123!`
- Organization manager: `manager@myvapp.local` / `ChangeMe123!`
- Demo voter: `voter1@myvapp.local` / `ChangeMe123!`
- Additional seeded voters for result data: `voter2@myvapp.local`, `voter3@myvapp.local` / `ChangeMe123!`

This means the frontend can be checked immediately:

- sign in as the admin or manager to manage elections
- sign in as `voter1@myvapp.local` to cast a ballot in the open election
- inspect the closed seeded election to confirm the results view is populated

## Organization roles and ballot eligibility

Organization roles now drive both management access and ballot eligibility:

- `OWNER`: full organization control and eligible to vote
- `ADMIN`: can manage elections and members, and is eligible to vote
- `VOTER`: can access and submit ballots, but cannot manage organization settings
- `MEMBER`: basic membership only, without ballot access

Ballot access is now restricted to eligible members only. A user must belong to the organization with one of these roles to open or submit a ballot:

- `OWNER`
- `ADMIN`
- `VOTER`

## Election-scoped voter eligibility

The next voting-security layer is election-scoped eligibility, which is now documented and partially scaffolded in the API:

- `ElectionEligibilityImportJob` represents an import preview or committed eligibility batch.
- `ElectionEligibility` represents one approved voter for one election.
- `ElectionInvite` represents a one-time invite token for that election-scoped eligibility record.

Milestone 1 adds the schema and API contracts for:

- `POST /organizations/:organizationId/elections/:electionId/eligibility-imports/preview`
- `POST /organizations/:organizationId/elections/:electionId/eligibility-imports/:importId/commit`
- `GET /organizations/:organizationId/elections/:electionId/eligibility`
- `POST /organizations/:organizationId/elections/:electionId/invitations/send`
- `POST /organizations/:organizationId/elections/:electionId/invitations/:eligibilityId/resend`
- `GET /public/elections/:electionSlug/claim-context?token=...`
- `POST /public/elections/:electionSlug/claim`

Milestone 1 is contract-first:

- the roster endpoint is live and returns the current election-scoped eligibility view
- import preview, import commit, invitation send/resend, and public claim endpoints are stubbed with `501 Not Implemented`
- later milestones will add CSV/XLSX parsing, SMTP invite delivery, and the public claim UI

## Result visibility policy

For alumni elections, MyVapp is adopting a safer publication policy:

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

### Example register payload

```json
{
  "firstName": "Ada",
  "lastName": "Okafor",
  "email": "ada@example.com",
  "password": "SecurePass1"
}
```

### Example login payload

```json
{
  "email": "ada@example.com",
  "password": "SecurePass1"
}
```

## Database design

The initial Prisma schema models the platform around a multi-tenant election workflow:

- `User`: platform identity and hashed credentials
- `Organization`: a tenant such as a church, union, club, or association
- `OrganizationMember`: connects users to organizations and roles
- `Election`: a voting exercise owned by an organization
- `Office`: a role being contested in an election
- `Candidate`: a person or profile standing for an office
- `Ballot`: one voter's submission for one election
- `Vote`: the office-level selections inside a ballot

## Voting flow

The current backend now supports this core sequence:

1. Register or log in.
2. Create an organization.
3. Create an election under that organization.
4. Add offices and candidates.
5. Change the election status to `OPEN`.
6. Fetch the ballot for the current voter.
7. Submit one ballot with one candidate per office.
8. View manager-only result tallies.

## Authentication notes

- Passwords are hashed with `bcryptjs`
- Login returns a JWT access token
- Protected routes use `Authorization: Bearer <token>`
- `GET /api/v1/auth/me` proves the auth guard and token verification path

For a later hardening pass, the next improvements should be:

- Refresh tokens
- Email verification
- Password reset flows
- Rate limiting
- Audit logging
- Organization-scoped permissions

## Testing

API unit tests are scaffolded with Vitest for schema and helper validation:

```bash
cd apps/api
npm test
```

They currently cover:

- slug generation rules
- auth payload validation
- organization payload validation
- election, office, and candidate payload validation
- ballot payload validation

## Docker notes

The current Docker setup is designed to be a strong starter:

- PostgreSQL runs as a separate service with health checks and a persistent volume
- The API image builds TypeScript, generates Prisma client code, and applies schema updates at startup
- The web image builds static assets and serves them through Nginx

## Recommended next implementation steps

1. Add update and delete flows for organizations, elections, offices, and candidates.
2. Add office rules for multi-seat positions and abstentions.
3. Add organization admin invites and richer organization-scoped roles.
4. Replace `prisma db push` in production with formal Prisma migrations.
5. Add integration tests for auth, election management, and ballot submission endpoints.
6. Add CI to lint, build, and validate the Prisma schema on every push.

## Architecture doc

See [docs/architecture.md](docs/architecture.md) for a deeper explanation of the proposed system structure.
