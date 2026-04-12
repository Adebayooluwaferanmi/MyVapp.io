import type { Request, Response } from "express";

import {
  createOrganizationMemberSchema,
  createOrganizationSchema,
  organizationMemberParamsSchema,
  organizationParamsSchema,
  updateOrganizationMemberRoleSchema
} from "./organizations.schemas";
import {
  addOrganizationMember,
  createOrganizationForUser,
  getOrganizationById,
  listOrganizationMembers,
  listOrganizationsForUser,
  updateOrganizationMemberRole
} from "./organizations.service";

export async function listOrganizations(request: Request, response: Response): Promise<void> {
  const organizations = await listOrganizationsForUser(request.user!.sub, request.user?.role);

  response.status(200).json({
    organizations
  });
}

export async function getOrganization(request: Request, response: Response): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const organization = await getOrganizationById(organizationId);

  response.status(200).json({
    organization
  });
}

export async function createOrganization(request: Request, response: Response): Promise<void> {
  const payload = createOrganizationSchema.parse(request.body);
  const organization = await createOrganizationForUser(request.user!.sub, payload);

  response.status(201).json({
    message: "Organization created successfully.",
    organization
  });
}

export async function getOrganizationMembers(request: Request, response: Response): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const members = await listOrganizationMembers(organizationId);

  response.status(200).json({
    members
  });
}

export async function createOrganizationMember(request: Request, response: Response): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const payload = createOrganizationMemberSchema.parse(request.body);
  const result = await addOrganizationMember(organizationId, payload);

  response.status(201).json({
    message: result.invited
      ? "Member invited successfully."
      : "Existing user added to the organization successfully.",
    member: result.member,
    invited: result.invited,
    temporaryPassword: result.temporaryPassword
  });
}

export async function patchOrganizationMemberRole(request: Request, response: Response): Promise<void> {
  const { organizationId, memberId } = organizationMemberParamsSchema.parse(request.params);
  const payload = updateOrganizationMemberRoleSchema.parse(request.body);
  const member = await updateOrganizationMemberRole(organizationId, memberId, payload);

  response.status(200).json({
    message: "Organization member role updated successfully.",
    member
  });
}
