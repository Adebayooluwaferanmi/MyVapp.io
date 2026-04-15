import { MembershipRole } from "@prisma/client";
import { z } from "zod";

import {
  organizationThemeInputSchema,
  updateOrganizationThemeSchema
} from "./organization-theme";

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional()
}).merge(organizationThemeInputSchema);

export const organizationParamsSchema = z.object({
  organizationId: z.string().cuid()
});

export const organizationMemberParamsSchema = organizationParamsSchema.extend({
  memberId: z.string().cuid()
});

export const createOrganizationMemberSchema = z.object({
  firstName: z.string().trim().min(2).max(50),
  lastName: z.string().trim().min(2).max(50),
  email: z.string().trim().email(),
  role: z.nativeEnum(MembershipRole)
});

export const updateOrganizationMemberRoleSchema = z.object({
  role: z.nativeEnum(MembershipRole)
});

export const updateOrganizationThemeBodySchema = updateOrganizationThemeSchema;

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type CreateOrganizationMemberInput = z.infer<typeof createOrganizationMemberSchema>;
export type UpdateOrganizationMemberRoleInput = z.infer<typeof updateOrganizationMemberRoleSchema>;
export type UpdateOrganizationThemeInput = z.infer<typeof updateOrganizationThemeBodySchema>;
