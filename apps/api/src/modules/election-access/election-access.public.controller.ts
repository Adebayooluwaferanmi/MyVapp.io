import type { Request, Response } from "express";

import { getRequestAuditContext } from "../../lib/request-audit";
import {
  publicElectionClaimContextParamsSchema,
  publicElectionClaimContextQuerySchema,
  publicElectionClaimSchema
} from "./election-access.schemas";
import { claimPublicElectionInvite, getPublicElectionClaimContext } from "./election-access.service";

export async function getPublicClaimContext(request: Request, response: Response): Promise<void> {
  const { electionSlug } = publicElectionClaimContextParamsSchema.parse(request.params);
  const { token } = publicElectionClaimContextQuerySchema.parse(request.query);
  const result = await getPublicElectionClaimContext(electionSlug, token);

  response.status(200).json(result);
}

export async function postPublicClaim(request: Request, response: Response): Promise<void> {
  const { electionSlug } = publicElectionClaimContextParamsSchema.parse(request.params);
  const payload = publicElectionClaimSchema.parse(request.body);
  const result = await claimPublicElectionInvite(electionSlug, payload, getRequestAuditContext(request));

  response.status(200).json(result);
}
