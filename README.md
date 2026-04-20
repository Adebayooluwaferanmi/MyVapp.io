# MyVapp

MyVapp is a multi-tenant election administration platform for organizations that need controlled, auditable election operations.

## Product Direction

MyVapp enforces an election-scoped participation model:

- organization managers are organization-wide
- voters are election-scoped
- voter participation is based on approved voter roll imports
- invite links are one-time use
- voters can access from multiple devices
- only one final ballot submission is allowed
- prior session invalidation on new login is configurable per election
- live result visibility is configurable by election policy
- election structure locks after opening
- auditability is a first-class requirement

## Architecture Summary

Backend model direction is centered on these domain entities:

- `User`
- `Organization`
- `OrganizationMember`
- `Election`
- `ElectionAccessAssignment`
- `ElectionVoterImportJob`
- `ElectionVoter`
- `ElectionInvite`
- `ElectionSession`
- `Office`
- `Candidate`
- `Ballot`
- `Vote`
- `AuditLog`

Voter identity for ballot submission is `ElectionVoter`, not generic `User`.

## Backend Modules

`apps/api/src/modules` is being refactored to this split:

- `auth`
- `organizations`
- `elections`
- `election-voters`
- `election-invites`
- `election-access`
- `ballots`
- `exports`
- `dashboard`
- `audit`

## Election Lifecycle

`Election` lifecycle:

- `DRAFT`
- `READY`
- `OPEN`
- `CLOSED`
- `ARCHIVED`

Policy fields on election:

- `resultsVisibilityMode`
- `lockAfterOpen`
- `invalidatePriorSessionOnNewLogin`
- `openedAt`
- `closedAt`

## Development

### Prerequisites

- Node.js 20+
- npm
- PostgreSQL

### API scripts

From `apps/api`:

- `npm run prisma:generate`
- `npm run build`
- `npm run test`
- `npm run dev`

## Documentation

See [docs/architecture.md](docs/architecture.md) for full backend architecture direction.
