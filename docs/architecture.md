# MyVapp Architecture

## Overview

MyVapp is a multi-tenant election administration platform for organizations that require controlled voter eligibility, strict election lifecycle rules, and auditable operations.

MyVapp is not an open self-registration voting app.

## Core Rules

- organization managers are organization-wide
- voters are election-scoped
- participation comes from an approved election voter roll
- invite links are one-time use
- voters can access from multiple devices
- only one final ballot submission is allowed
- prior session invalidation on new login is configurable per election
- live result visibility is configurable per election
- election structure locks after opening
- sensitive actions are auditable

## Domain Model

### User

Platform identity for organization and admin actors.

### Organization

Tenant boundary.

### OrganizationMember

Organization-scoped user role assignment.

### Election

Election event with lifecycle and policy configuration.

Fields include:

- `status`
- `startsAt`
- `endsAt`
- `openedAt`
- `closedAt`
- `resultsVisibilityMode`
- `lockAfterOpen`
- `invalidatePriorSessionOnNewLogin`

### ElectionAccessAssignment

Election-scoped role assignment for non-manager visibility and observation access.

Roles:

- `CHAIR`
- `OBSERVER`

### ElectionVoterImportJob

Audit-capable import job for election voter roll operations.

### ElectionVoter

Election-scoped voter identity.

Tracks:

- voter profile fields
- voter status lifecycle
- claim and vote timestamps

### ElectionInvite

One-time invite lifecycle tied to an `ElectionVoter`.

Tracks:

- hashed token
- expiry
- used/revoked state
- send/resend metadata

### ElectionSession

Election-scoped temporary access session for voters.

Tracks:

- voter/session binding
- expiry
- revocation
- device/network metadata

### Office and Candidate

Election contest structure.

### Ballot and Vote

`Ballot` belongs to `ElectionVoter` and election.

Rules:

- one final ballot per `ElectionVoter` per election
- optional `submittedSessionId`
- receipt reference generated on successful submission

### AuditLog

Captures sensitive operation audit events.

Required fields:

- `organizationId`
- `electionId` where relevant
- `actorUserId` for manager/admin actions
- `actorElectionVoterId` for voter actions
- `action`
- `targetType`
- `targetId`
- `metadata`
- `previousHash` and `entryHash` placeholders

## Backend Module Split

`apps/api/src/modules/`:

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

This split replaces the prior broad `eligibility` module with election-scoped bounded contexts.

## Election Lifecycle Enforcement

Election status progression:

- `DRAFT`
- `READY`
- `OPEN`
- `CLOSED`
- `ARCHIVED`

When election is `OPEN` and lock policy is active:

- office structure is immutable
- candidate structure is immutable
- voter roll mutations are constrained

## Results Visibility

Live result access is policy-based and role-aware.

Policy is controlled by `Election.resultsVisibilityMode` and enforced with:

- organization manager role
- `ElectionAccessAssignment` (`CHAIR` / `OBSERVER`)

## Audit-Critical Operations

At minimum:

- election create/update/open/close
- voter import preview/commit
- invite send/resend/revoke
- access claim
- session create/revoke
- ballot submission
- voter export
- result export

## Principle

Architecture decisions prioritize election integrity, clear authorization boundaries, and traceable operations.
