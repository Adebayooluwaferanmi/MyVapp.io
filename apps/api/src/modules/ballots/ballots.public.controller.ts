import type { Request, Response } from "express";

import { publicElectionClaimContextParamsSchema } from "../eligibility/eligibility.schemas";
import { getPublicElectionResults } from "./ballots.service";

export async function getPublicResults(request: Request, response: Response): Promise<void> {
  const { electionSlug } = publicElectionClaimContextParamsSchema.parse(request.params);
  const results = await getPublicElectionResults(electionSlug);

  response.status(200).json(results);
}

