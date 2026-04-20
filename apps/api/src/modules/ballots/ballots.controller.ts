import type { Request, Response } from "express";

import { getRequestAuditContext } from "../../lib/request-audit";
import { electionParamsSchema, submitBallotSchema } from "./ballots.schemas";
import {
  getBallotForElection,
  getElectionResultsForViewer,
  submitBallot
} from "./ballots.service";

export async function getMyBallot(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId } = electionParamsSchema.parse(request.params);
  const ballotState = await getBallotForElection(organizationId, electionId, request.user!);

  response.status(200).json(ballotState);
}

export async function submitMyBallot(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId } = electionParamsSchema.parse(request.params);
  const payload = submitBallotSchema.parse(request.body);
  const ballot = await submitBallot(
    organizationId,
    electionId,
    request.user!,
    payload,
    getRequestAuditContext(request)
  );

  response.status(201).json({
    message: "Ballot submitted successfully.",
    ballot
  });
}

export async function getResults(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId } = electionParamsSchema.parse(request.params);
  const results = await getElectionResultsForViewer({
    organizationId,
    electionId,
    principal: request.user!,
    membershipRole: request.membership?.role
  });

  response.status(200).json(results);
}
