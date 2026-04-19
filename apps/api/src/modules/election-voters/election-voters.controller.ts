import type { Request, Response } from "express";

import {
  commitElectionVoterImportSchema,
  electionVoterImportParamsSchema,
  electionVotersParamsSchema,
  listElectionVotersQuerySchema,
  previewElectionVoterImportSchema
} from "./election-voters.schemas";
import {
  commitElectionVoterImport,
  listElectionVoterRoster,
  previewElectionVoterImport
} from "./election-voters.service";

export async function getElectionVoters(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId } = electionVotersParamsSchema.parse(request.params);
  const query = listElectionVotersQuerySchema.parse(request.query);
  const roster = await listElectionVoterRoster(organizationId, electionId, query);

  response.status(200).json(roster);
}

export async function postElectionVoterImportPreview(
  request: Request,
  response: Response
): Promise<void> {
  const { organizationId, electionId } = electionVotersParamsSchema.parse(request.params);
  const payload = previewElectionVoterImportSchema.parse(request.body);
  const result = await previewElectionVoterImport(organizationId, electionId, payload, request.user!.sub);

  response.status(201).json(result);
}

export async function postElectionVoterImportCommit(
  request: Request,
  response: Response
): Promise<void> {
  const { organizationId, electionId, importId } = electionVoterImportParamsSchema.parse(request.params);
  const payload = commitElectionVoterImportSchema.parse(request.body);
  const result = await commitElectionVoterImport(
    organizationId,
    electionId,
    importId,
    payload,
    request.user!.sub
  );

  response.status(200).json(result);
}
