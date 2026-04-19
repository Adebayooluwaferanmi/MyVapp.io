import type { Request, Response } from "express";

import { getRequestAuditContext } from "../../lib/request-audit";
import {
  createElectionAccessAssignmentSchema,
  electionAccessAssignmentParamsSchema,
  electionAccessParamsSchema
} from "./election-access.schemas";
import {
  createElectionAccessAssignment,
  listElectionAccessAssignments,
  removeElectionAccessAssignment
} from "./election-access.service";

export async function getElectionAccessAssignments(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId } = electionAccessParamsSchema.parse(request.params);
  const assignments = await listElectionAccessAssignments(organizationId, electionId);

  response.status(200).json({
    assignments
  });
}

export async function postElectionAccessAssignment(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId } = electionAccessParamsSchema.parse(request.params);
  const payload = createElectionAccessAssignmentSchema.parse(request.body);
  const assignment = await createElectionAccessAssignment(
    organizationId,
    electionId,
    payload,
    request.user!.sub,
    getRequestAuditContext(request)
  );

  response.status(201).json({
    assignment
  });
}

export async function deleteElectionAccessAssignment(request: Request, response: Response): Promise<void> {
  const { organizationId, electionId, assignmentId } = electionAccessAssignmentParamsSchema.parse(request.params);
  const result = await removeElectionAccessAssignment(
    organizationId,
    electionId,
    assignmentId,
    request.user!.sub,
    getRequestAuditContext(request)
  );

  response.status(200).json(result);
}
