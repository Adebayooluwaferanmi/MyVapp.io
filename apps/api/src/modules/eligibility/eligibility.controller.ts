import type { Request, Response } from "express";

import {
  commitElectionEligibilityImportSchema,
  electionEligibilityParamsSchema,
  eligibilityImportParamsSchema,
  eligibilityInviteParamsSchema,
  listElectionEligibilityQuerySchema,
  previewElectionEligibilityImportSchema,
  publicElectionClaimContextParamsSchema,
  publicElectionClaimContextQuerySchema,
  publicElectionClaimSchema,
  sendElectionInvitationsSchema
} from "./eligibility.schemas";
import {
  claimPublicElectionInvite,
  commitElectionEligibilityImport,
  getPublicElectionClaimContext,
  listElectionEligibilityRoster,
  previewElectionEligibilityImport,
  resendElectionInvitation,
  sendElectionInvitations
} from "./eligibility.service";

export async function getElectionEligibility(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId } = electionEligibilityParamsSchema.parse(request.params);
  const query = listElectionEligibilityQuerySchema.parse(request.query);
  const roster = await listElectionEligibilityRoster(organizationId, electionId, query);

  response.status(200).json(roster);
}

export async function postElectionEligibilityImportPreview(
  request: Request,
  response: Response
): Promise<void> {
  const { organizationId, electionId } = electionEligibilityParamsSchema.parse(request.params);
  const payload = previewElectionEligibilityImportSchema.parse(request.body);
  const result = await previewElectionEligibilityImport(
    organizationId,
    electionId,
    payload,
    request.user!.sub
  );

  response.status(201).json(result);
}

export async function postElectionEligibilityImportCommit(
  request: Request,
  response: Response
): Promise<void> {
  const { organizationId, electionId, importId } = eligibilityImportParamsSchema.parse(request.params);
  const payload = commitElectionEligibilityImportSchema.parse(request.body);
  const result = await commitElectionEligibilityImport(
    organizationId,
    electionId,
    importId,
    payload,
    request.user!.sub
  );

  response.status(200).json(result);
}

export async function postElectionInvitationsSend(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId } = electionEligibilityParamsSchema.parse(request.params);
  const payload = sendElectionInvitationsSchema.parse(request.body);
  const result = await sendElectionInvitations(
    organizationId,
    electionId,
    payload,
    request.user!.sub
  );

  response.status(202).json(result);
}

export async function postElectionInvitationResend(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId, eligibilityId } = eligibilityInviteParamsSchema.parse(request.params);
  const result = await resendElectionInvitation(
    organizationId,
    electionId,
    eligibilityId,
    request.user!.sub
  );

  response.status(202).json(result);
}

export async function getPublicClaimContext(request: Request, response: Response): Promise<void> {
  const { electionSlug } = publicElectionClaimContextParamsSchema.parse(request.params);
  const { token } = publicElectionClaimContextQuerySchema.parse(request.query);
  const result = await getPublicElectionClaimContext(electionSlug, token);

  response.status(200).json(result);
}

export async function postPublicClaim(request: Request, response: Response): Promise<void> {
  const { electionSlug } = publicElectionClaimContextParamsSchema.parse(request.params);
  const payload = publicElectionClaimSchema.parse(request.body);
  const result = await claimPublicElectionInvite(electionSlug, payload);

  response.status(200).json(result);
}
