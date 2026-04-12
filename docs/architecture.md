# MyVapp Architecture

## Overview

MyVapp should behave like a multi-tenant election platform:

- A platform user can belong to multiple organizations
- Each organization can run multiple elections
- Each election can define one or more offices
- Each office can have multiple candidates
- Each voter submits one ballot per election
- Each ballot contains at most one vote per office in the current starter model

This architecture is aimed at groups that want customizable internal elections, not a one-off poll app.

## Why a modular monorepo-style layout

Even though the current repository started nearly empty, the product intent already points to two clear application boundaries:

- A backend API with sensitive election, identity, and integrity rules
- A frontend application for administrators, candidates, and voters

Separating them early prevents a flat repo from becoming hard to navigate once more modules arrive.

## Backend structure

`apps/api/src` is organized by responsibility:

- `config`: validated environment configuration
- `lib`: shared runtime helpers such as Prisma, JWT, password hashing, and custom errors
- `middlewares`: auth, error, and HTTP boundary concerns
- `modules`: domain-focused features
- `routes`: route composition
- `types`: ambient type extensions

This is preferable to a single `controllers` folder because election systems naturally grow into bounded domains.

## Domain model

### User

Represents an authenticated platform identity. Holds hashed credentials and a platform role.

### Organization

Represents a tenant. A tenant can be a church, school, cooperative, alumni body, club, political ward, association, or community group.

### OrganizationMember

Represents organization-scoped membership and role assignment. A user can belong to many organizations and can have different responsibilities in each one.

### Election

Represents a scheduled voting event belonging to one organization.

### Office

Represents a position being contested, such as president, treasurer, secretary, welfare officer, or any custom office defined by the organization.

### Candidate

Represents a candidate record for a specific office. In a later revision this can also link directly to a registered user profile when self-service nominations are introduced.

### Ballot

Represents one voter submission for one election.

### Vote

Represents the selection inside a ballot for a specific office. The starter model enforces one vote per office per ballot.

## Authentication approach

The first implemented auth module uses:

- Email and password registration
- `bcryptjs` for password hashing
- JWT access tokens for session continuity
- Bearer-token route protection

This is a reasonable early scaffold because it keeps the API stateless and simple while the rest of the domain is still being built.

Recommended later upgrades:

- Refresh token table
- Revocation support
- Email verification
- Password reset
- Login throttling
- IP and audit event tracking

## Infrastructure

### PostgreSQL

PostgreSQL is the right baseline for this app because the domain has strong relational boundaries:

- users to organizations
- organizations to elections
- elections to offices
- offices to candidates
- ballots to votes

The integrity guarantees matter more than the flexibility of a schemaless store here.

### Docker

The container strategy separates concerns cleanly:

- `postgres` stores durable relational data
- `api` serves business logic and auth
- `web` serves the React UI through Nginx

This makes onboarding simpler and gives a path to later cloud deployment.

## Scaling path

The next stages of the architecture should be:

1. Add organization administration and invitations.
2. Add election creation and publishing flows.
3. Add candidate nomination and approval workflows.
4. Add ballot casting and vote tabulation modules.
5. Add audit trails and result publication.
6. Add test coverage and CI enforcement.

## Recommended future folders

Once the feature set expands, this is the direction to grow toward inside `apps/api/src/modules`:

```text
modules
├── auth
├── users
├── organizations
├── memberships
├── elections
├── offices
├── candidates
├── ballots
├── votes
└── audit
```

And on the frontend:

```text
src
├── app
├── components
├── features
│   ├── auth
│   ├── organizations
│   ├── elections
│   ├── candidates
│   └── voting
├── hooks
├── lib
└── styles
```

## Key design principle

This app should be built around election integrity and organization flexibility, not just around simple forms. That means the architecture should always make it easy to answer questions like:

- Who is allowed to create or open an election?
- Which offices belong to which election?
- Has this voter already submitted a ballot?
- Can this organization customize its office list?
- Can we audit who changed the election state and when?

Those questions are why the project benefits from a clear modular structure from the beginning.
