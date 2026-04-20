import type { Request, Response } from "express";

import {
  electionInviteVoterParamsSchema,
  electionInvitesParamsSchema,
  sendElectionInvitesSchema
} from "./election-invites.schemas";
import {
  previewElectionInvites,
  resendElectionInvite,
  revokeUnusedInvites,
  sendElectionInvites
} from "./election-invites.service";

export async function postElectionInvitesPreview(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId } = electionInvitesParamsSchema.parse(request.params);
  const payload = sendElectionInvitesSchema.parse(request.body);
  const result = await previewElectionInvites(organizationId, electionId, payload);

  response.status(200).json(result);
}

export async function postElectionInvitesSend(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId } = electionInvitesParamsSchema.parse(request.params);
  const payload = sendElectionInvitesSchema.parse(request.body);
  const result = await sendElectionInvites(organizationId, electionId, payload, request.user!.sub);

  response.status(202).json(result);
}

export async function postElectionInviteResend(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId, electionVoterId } = electionInviteVoterParamsSchema.parse(request.params);
  const result = await resendElectionInvite(
    organizationId,
    electionId,
    electionVoterId,
    request.user!.sub
  );

  response.status(202).json(result);
}

export async function postElectionInviteRevoke(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId, electionVoterId } = electionInviteVoterParamsSchema.parse(request.params);
  const result = await revokeUnusedInvites(
    organizationId,
    electionId,
    electionVoterId,
    request.user!.sub
  );

  response.status(200).json(result);
}
