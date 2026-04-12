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
- Architecture and setup documentation

## Product intent

This project is shaped around a real voting domain:

- One platform can serve multiple organizations
- Each organization can define its own election cycles
- Each election can define one or more offices
- Each office can accept candidates and record votes
- Users can belong to organizations with different roles
- Authentication is implemented first so later admin and voter flows sit on a secure base

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

## Environment setup

1. Copy the env template:

```bash
cp .env.example .env
```

2. Review and change these values before real use:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
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
