import type {
  CommitElectionEligibilityImportInput,
  ListElectionEligibilityQuery,
  PreviewElectionEligibilityImportInput,
  PublicElectionClaimInput,
  SendElectionInvitationsInput
} from "./eligibility.schemas";

import {
  claimPublicElectionInvite as claimElectionAccess,
  getPublicElectionClaimContext
} from "../election-access/election-access.service";
import { resendElectionInvite, sendElectionInvites } from "../election-invites/election-invites.service";
import {
  commitElectionVoterImport,
  listElectionVoterRoster,
  previewElectionVoterImport
} from "../election-voters/election-voters.service";

export async function listElectionEligibilityRoster(
  organizationId: string,
  electionId: string,
  query: ListElectionEligibilityQuery
) {
  return listElectionVoterRoster(organizationId, electionId, query);
}

export async function previewElectionEligibilityImport(
  organizationId: string,
  electionId: string,
  input: PreviewElectionEligibilityImportInput,
  actorUserId: string
) {
  return previewElectionVoterImport(organizationId, electionId, input, actorUserId);
}

export async function commitElectionEligibilityImport(
  organizationId: string,
  electionId: string,
  importId: string,
  input: CommitElectionEligibilityImportInput,
  actorUserId: string
) {
  return commitElectionVoterImport(organizationId, electionId, importId, input, actorUserId);
}

export async function sendElectionInvitations(
  organizationId: string,
  electionId: string,
  input: SendElectionInvitationsInput,
  actorUserId: string
) {
  return sendElectionInvites(
    organizationId,
    electionId,
    {
      electionVoterIds: input.eligibilityIds,
      search: input.search
    },
    actorUserId
  );
}

export async function resendElectionInvitation(
  organizationId: string,
  electionId: string,
  eligibilityId: string,
  actorUserId: string
) {
  return resendElectionInvite(organizationId, electionId, eligibilityId, actorUserId);
}

export { getPublicElectionClaimContext };

export async function claimPublicElectionInvite(electionSlug: string, input: PublicElectionClaimInput) {
  return claimElectionAccess(electionSlug, input);
}
