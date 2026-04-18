# MyVapp

MyVapp is a multi-tenant election administration platform for organizations that need a controlled, auditable, and trustworthy way to run internal elections.

MyVapp is not an open self-registration voting app.

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
