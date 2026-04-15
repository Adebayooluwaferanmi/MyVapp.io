# Voter Registry Runbook

This runbook describes the operator flow for an election that uses a pre-approved voter registry in MyVapp.

## Target operating model

Use this workflow when an organization already has an official voter register and wants secure, election-scoped access instead of open self-registration.

## End-to-end flow

1. Create the organization if it does not already exist.
2. Create the election and set its timeline.
3. Build the ballot by adding offices and candidates.
4. Import the approved voter register from `CSV` or `XLSX`.
5. Review validation errors and commit the approved eligibility roster.
6. Send one-time election invitation links to eligible voters.
7. Monitor invite delivery, claimed access, and submitted-ballot turnout.
8. Open the election only when the roster and ballot are ready.
9. Close the election when the configured window ends.
10. Publish results after close.

## Required import columns

The v1 registry format is:

- `member_unique_id`
- `full_name`
- `age`
- `email`

Rules:

- emails are normalized to lowercase
- duplicate `member_unique_id` values are rejected
- duplicate `email` values inside the same election roster are rejected
- PDF is not supported in v1

## Security model

The voter access model is:

- an election-specific invite link
- a one-time token
- confirmation of the voter’s `member_unique_id`

This is safer than issuing a reusable visible “voting ID”.

## Results policy

- Managers may see turnout metrics while the election is `OPEN`.
- Candidate tallies are hidden until the election is closed.
- Voters and public viewers only see results after close.

## Milestone status

### Milestone 1

- Data model and API contracts are in place.
- The election eligibility roster endpoint is available.

### Milestone 2

- CSV/XLSX parsing, row validation, import preview/commit, and invitation delivery are implemented.
- The manager workspace can preview a voter registry, commit accepted rows, filter election eligibility, and send or resend invites.

### Milestone 3

- Public claim flow, voter election home, and post-close public results.
