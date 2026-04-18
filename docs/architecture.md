# MyVapp Architecture

## Overview

MyVapp is a multi-tenant election administration platform for organizations that need a controlled, auditable, and trustworthy way to run internal elections.

MyVapp is not an open self-registration voting app.

The platform works like this:

- an organization-wide manager creates and configures an election
- the election window, structure, and policies are defined before voting begins
- the approved voter roll is uploaded through CSV import
- invite links are previewed and sent to eligible voters
- voters activate temporary election-scoped access through one-time invite links
- voters participate only within the configured election period
- election operations are auditable
- result visibility follows election policy

This platform is built for groups, unions, associations, schools, faith communities, clubs, and other organizations that need controlled internal elections.

## Product identity

MyVapp is built around election integrity, controlled eligibility, and operational trust.

The architecture is designed to answer these questions clearly and consistently:

- who configured this election
- who is authorized to participate
- how voter eligibility was established
- which invite was sent, when, and to whom
- whether a voter has already activated access
- whether a voter’s election access is still valid
- whether a voter has already submitted a final ballot
- who changed election state and when
- who can view results while the election is open

## Core product rules

The following rules define MyVapp.

### Access model

- voter access is election-scoped
- invite links are one-time use
- voter access comes from an approved voter roll
- voter participation does not depend on open public registration
- managers are organization-wide

### Invite behavior

- bulk invite sending is supported
- individual resend is supported
- individual resend supports searching for a specific voter email
- invite preview is required before sending

### Session behavior

- a voter can access from multiple devices
- only one final ballot submission is allowed
- prior active session invalidation on new login is configurable per election

### Result visibility

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

## System boundaries

The product has two application boundaries:

- a backend API that enforces election rules, access control, and auditability
- a frontend application for administrators, observers, and voters

The repository is structured to keep these responsibilities separate as the system grows.

## Backend structure

`apps/api/src` is organized by responsibility:

- `config`, validated environment configuration
- `lib`, shared runtime helpers such as Prisma, JWT, hashing, mail, CSV helpers, and custom errors
- `middlewares`, auth, access control, audit hooks, and HTTP boundary concerns
- `modules`, domain-focused features
- `routes`, route composition
- `types`, ambient type extensions

This structure reflects the fact that election systems grow through clear domain boundaries, not through a flat controller-only layout.

## Actors

### Platform admin

The platform admin operates the SaaS at platform level.

This role covers platform operations and internal support. It is separate from normal election execution.

### Organization manager

The organization manager is an organization-wide administrative actor.

This role can:

- create elections
- configure election settings
- upload voter rolls
- preview and send invites
- resend invites
- monitor election dashboards
- manage result visibility
- export voter rolls and results
- inspect audit logs

### Election chair

The election chair oversees the operational conduct of a live election.

This role can:

- supervise election execution
- monitor turnout and live metrics
- view live results when policy allows
- oversee opening and closing flow

### Observer

The observer is an authorized read-oriented actor.

This role can:

- view election state
- view turnout and dashboard metrics
- view results when election policy allows

The observer cannot change election structure, voter rolls, or ballot configuration.

### Eligible voter

The eligible voter is a participant imported into a specific election voter roll.

This role can:

- activate election-scoped access
- authenticate within the election window
- cast one final ballot

Eligible voters are modeled first as election participants, not as open self-registering platform users.

## Domain model

### User

`User` represents an authenticated platform identity for managers and other organization-level actors.

This model supports organization-wide administration.

### Organization

Represents a tenant. A tenant can be a church, school, cooperative, club, political ward, association, union, or community group.
`Organization` represents a tenant.

A tenant can be a church, school, cooperative, alumni body, club, political ward, association, union, or community group.

### OrganizationMember

`OrganizationMember` represents organization-scoped membership and role assignment.

A user can belong to multiple organizations and can hold different responsibilities in each one.

This model supports organization-wide roles. It does not define election voter eligibility.

### Election

`Election` represents a scheduled voting event belonging to one organization.

An election includes:

- status
- start time
- end time
- result visibility policy
- lock-after-open behavior
- session invalidation policy

### Office

`Office` represents a position being contested in an election.

Examples include president, treasurer, secretary, welfare officer, and any other role defined by the organization.

### Candidate

`Candidate` represents a candidate record for a specific office.

### ElectionVoter

`ElectionVoter` represents an approved participant in one specific election.

This entity stores:

- full name
- email
- phone number
- election reference
- eligibility state
- invite state
- activation state
- voting state

### ElectionInvite

`ElectionInvite` represents a one-time invite lifecycle for election access.

This entity stores:

- hashed token
- expiry
- usage state
- revocation state
- resend tracking
- send tracking

### ElectionSession

`ElectionSession` represents temporary election-scoped authenticated access.

This entity stores:

- election-bound validity
- session expiry
- revocation state
- optional multi-device session behavior

### Ballot

`Ballot` represents one final voter submission for one election.

In MyVapp, the ballot belongs to an election-scoped voter identity.

### Vote

`Vote` represents the office-level selection inside a ballot.

The current rule is one vote per office per ballot unless office rules are expanded later.

### ElectionAuditLog

`ElectionAuditLog` records auditable election operations and sensitive actions.

It records events such as:

- election creation
- election updates
- status changes
- voter imports
- invite sends
- invite resends
- voter activation
- session revocation
- ballot submission
- export actions

## Election lifecycle

An election moves through a controlled lifecycle.

### Statuses

- `DRAFT`
- `READY`
- `OPEN`
- `CLOSED`
- `ARCHIVED`

### DRAFT

The election is being configured.

Allowed actions:

- create and edit offices
- create and edit candidates
- upload voter CSV
- validate voter roll
- configure policies

### READY

The election is structurally complete but not yet open for voting.

Allowed actions:

- preview invite batches
- send invites
- review voter roll
- make limited corrections before opening

### OPEN

Voting is active.

Allowed actions:

- voter activation
- voting
- dashboard monitoring
- result viewing according to policy

Disallowed actions:

- changing offices and candidates
- uncontrolled voter list mutation

### CLOSED

Voting has ended.

Allowed actions:

- final result access
- exports
- audit inspection

### ARCHIVED

### ElectionEligibilityImportJob

Represents a staged or committed voter-registry import for one election. This separates election operations from the broader organization membership list.

### ElectionEligibility

Represents one approved voter for one election. This is the authoritative source for whether someone may claim access to that election.

### ElectionInvite

Represents a one-time election invite token tied to a single election eligibility record. This is preferred over reusable visible voting IDs because it is easier to expire, revoke, audit, and protect.

## Authentication approach
The election is finalized and retained for historical, reporting, and audit purposes.

## Election lock policy

Once an election enters `OPEN`, the election is locked.

Locking means:

- offices cannot be added, removed, or silently changed
- candidates cannot be added, removed, or silently changed
- the contest structure is frozen
- voter list mutation is tightly restricted
- important policy changes are limited and audited

This prevents silent manipulation after the election has started.

## Voter roll model

Each election has its own voter roll.

A voter is eligible only when all of the following are true:

- the voter exists in that election’s voter roll
- the voter is marked eligible
- the invite or session is valid
- the election is within an allowed state and time window

A voter roll entry is not the same thing as a permanent platform account.

## CSV import rules

CSV import is a core workflow in MyVapp.

### Required initial fields

- full name
- email
- phone number

### Optional future fields

- voter code
- external identifier
- constituency
- department
- unit
- metadata columns

### CSV import behavior

The system:

- validates headers
- trims and normalizes values
- lowercases email addresses
- normalizes phone numbers
- detects duplicates within the uploaded file
- detects duplicates against the existing election voter roll
- rejects malformed rows
- persists valid rows
- produces a detailed import outcome

### Import result

The import result includes:

- total rows processed
- valid rows accepted
- invalid rows rejected
- duplicate count
- downloadable error report

### Error report

The error report identifies:

- row number
- offending field
- rejection reason

## Invite lifecycle

Invite management is a first-class workflow.

A voter record moves through states such as:

- `IMPORTED`
- `INVITE_PENDING`
- `INVITED`
- `ACTIVATED`
- `VOTED`
- `REVOKED`

### Invite requirements

Invite links are:

- unique
- one-time use
- revocable
- invalid after election end
- replaceable through resend flow

### Invite flows

The platform supports:

- preview before sending
- bulk send invites
- resend to a specific searched voter email

### Security requirement

Invite tokens are stored hashed, not in plaintext.

## Authentication model

Authentication in MyVapp follows two distinct tracks.

### Organization and platform authentication

Managers and other organization-level actors use platform-oriented authentication.

This includes:

- email and password login
- hashed credentials
- JWT-based session continuity
- bearer-token route protection

### Election-scoped voter access

Voters do not participate through open self-registration.

Instead:

- the voter receives a one-time invite link
- the voter activates election access
- the platform creates election-scoped authenticated access
- that access remains valid only within election rules and session policy

Election-scoped access validity depends on:

- election state
- election end time
- invite validity
- voter eligibility
- session revocation status

## Session rules

### Multiple devices

A voter can access from multiple devices.

### One final ballot

Only one final ballot submission is allowed per eligible voter per election.

### Optional prior-session invalidation

Per election configuration, the system either:

- revokes earlier active sessions when a new session is created

or

- allows multiple active sessions to remain valid

### Session expiry

Election-scoped sessions expire:

- at or before election end time
- immediately when revoked
- immediately when election access becomes invalid

## Ballot rules

Each ballot belongs to:

- one election
- one eligible election voter

The system enforces:

- the election is open
- the voter is eligible
- the voter session is valid
- the voter has not already submitted a final ballot
- selected candidates belong to the correct offices
- office-level ballot rules are respected

### Ballot receipt reference

After successful ballot submission, the system generates a receipt reference.

The receipt does not expose actual vote selections.

## Result visibility policy

Result visibility is configurable per election.

Supported policy directions include:

- no live results during open election
- chair-only live results
- chair-and-observer live results
- organization-manager live results
- public results after close

MyVapp allows results to be visible while the election is open only for authorized roles defined by election policy.

## Dashboard requirements

Each election exposes an operational dashboard.

### Required metrics

- total voters imported
- invites sent
- invites activated
- ballots cast
- turnout percentage

### Additional useful metrics

- revoked invites
- activation rate
- current election state
- open and close timestamps
- active sessions
- recent import errors

## Audit requirements

Auditability is a core system requirement.

The audit trail records:

- election creation
- election updates
- status changes
- voter CSV imports
- invite preview actions
- invite send actions
- resend actions
- voter activation
- session revocation
- ballot submission
- result export
- voter roll export
- sensitive policy changes

Each audit entry captures:

- actor
- action
- target type
- target id
- election id
- organization id
- timestamp
- relevant metadata

### Tamper-evident audit

A later phase adds tamper-evident audit chaining through linked hashes or equivalent integrity mechanisms.

The new voter-registry flow adds a second access layer:

- managers still use the standard email/password JWT model
- voters are approved through election-scoped eligibility
- voters claim election access using a one-time link and their `member_unique_id`

This keeps the existing platform auth model for administrators while tightening voter access around a specific election event.

## Infrastructure

### PostgreSQL

PostgreSQL is the system of record because the platform has strong relational boundaries:

- organizations to elections
- elections to offices
- offices to candidates
- elections to voter roll
- voter roll to invites
- voter roll to election sessions
- ballots to votes
- election actions to audit entries

The integrity guarantees matter more than the flexibility of a schemaless store.

### Docker

The container strategy separates concerns cleanly:

- `postgres` stores durable relational data
- `api` serves business logic, election access, and integrity rules
- `web` serves the frontend application

This keeps onboarding simple and preserves a clear path to cloud deployment.

## Scaling path

The architecture evolves in the following order:

1. Add organization administration and invitations.
2. Add election creation and publishing flows.
3. Add election-scoped voter registry imports and one-time invite claims.
4. Add candidate nomination and approval workflows.
5. Add ballot casting and vote tabulation modules.
6. Add audit trails and result publication.
7. Add test coverage and CI enforcement.
1. redesign the database model around election-scoped access
2. add voter CSV import and validation flows
3. add invite preview, send, and resend workflows
4. add election-scoped session activation and access control
5. refactor ballot submission around election-scoped voter identity
6. add dashboard metrics, exports, and audit inspection
7. add deeper security controls and tamper-evident audit support
8. expand automated testing and CI enforcement

## backend modules trajectory

As the backend grows, the module layout follows this direction:

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
- Was this voter approved for this specific election?
- Has this one-time invite already been claimed or expired?
- Can this organization customize its office list?
- Can we audit who changed the election state and when?

Those questions are why the project benefits from a clear modular structure from the beginning.

## Voter Registry Trust Model

For election-specific voter registries, the platform is moving to this trust model:

- organization membership controls manager/admin access
- election eligibility controls voter access
- voter registry imports come from `CSV` or `XLSX`, not PDF, in v1
- invite links are one-time, election-bound, and time-bound
- live turnout may be visible to managers during an open election
- live candidate tallies remain hidden until the election closes

This preserves transparency for operators without creating incentives for active voters to react to live polling swings.
