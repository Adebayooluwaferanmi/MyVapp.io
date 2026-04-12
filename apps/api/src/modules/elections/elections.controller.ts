import type { Request, Response } from "express";

import {
  createCandidateSchema,
  createElectionSchema,
  createOfficeSchema,
  electionParamsSchema,
  officeParamsSchema,
  organizationParamsSchema,
  updateElectionStatusSchema
} from "./elections.schemas";
import {
  createCandidate,
  createElection,
  createOffice,
  getElectionDetails,
  listElectionOffices,
  listOfficeCandidates,
  listOrganizationElections,
  updateElectionStatus
} from "./elections.service";

export async function listElections(request: Request, response: Response): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const elections = await listOrganizationElections(organizationId);

  response.status(200).json({
    elections
  });
}

export async function createElectionForOrganization(
  request: Request,
  response: Response
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const payload = createElectionSchema.parse(request.body);
  const election = await createElection(organizationId, payload);

  response.status(201).json({
    message: "Election created successfully.",
    election
  });
}

export async function getElection(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId } = electionParamsSchema.parse(request.params);
  const election = await getElectionDetails(organizationId, electionId);

  response.status(200).json({
    election
  });
}

export async function updateElectionStatusForOrganization(
  request: Request,
  response: Response
): Promise<void> {
  const { organizationId, electionId } = electionParamsSchema.parse(request.params);
  const payload = updateElectionStatusSchema.parse(request.body);
  const election = await updateElectionStatus(organizationId, electionId, payload);

  response.status(200).json({
    message: "Election status updated successfully.",
    election
  });
}

export async function listOffices(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId } = electionParamsSchema.parse(request.params);
  const offices = await listElectionOffices(organizationId, electionId);

  response.status(200).json({
    offices
  });
}

export async function createOfficeForElection(
  request: Request,
  response: Response
): Promise<void> {
  const { organizationId, electionId } = electionParamsSchema.parse(request.params);
  const payload = createOfficeSchema.parse(request.body);
  const office = await createOffice(organizationId, electionId, payload);

  response.status(201).json({
    message: "Office created successfully.",
    office
  });
}

export async function listCandidates(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId, officeId } = officeParamsSchema.parse(request.params);
  const candidates = await listOfficeCandidates(organizationId, electionId, officeId);

  response.status(200).json({
    candidates
  });
}

export async function createCandidateForOffice(
  request: Request,
  response: Response
): Promise<void> {
  const { organizationId, electionId, officeId } = officeParamsSchema.parse(request.params);
  const payload = createCandidateSchema.parse(request.body);
  const candidate = await createCandidate(organizationId, electionId, officeId, payload);

  response.status(201).json({
    message: "Candidate created successfully.",
    candidate
  });
}
