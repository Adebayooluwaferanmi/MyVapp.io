import { ElectionAccessRole } from "@prisma/client";
import { z } from "zod";

export const electionAccessParamsSchema = z.object({
  organizationId: z.string().cuid(),
  electionId: z.string().cuid()
});

export const electionAccessAssignmentParamsSchema = electionAccessParamsSchema.extend({
  assignmentId: z.string().cuid()
});

export const createElectionAccessAssignmentSchema = z.object({
  userId: z.string().cuid(),
  role: z.nativeEnum(ElectionAccessRole)
});

export const publicElectionClaimContextParamsSchema = z.object({
  electionSlug: z.string().trim().min(1)
});

export const publicElectionClaimContextQuerySchema = z.object({
  token: z.string().trim().min(16)
});

export const publicElectionClaimSchema = z.object({
  token: z.string().trim().min(16),
  memberUniqueId: z.string().trim().min(2).max(120)
});

export type PublicElectionClaimInput = z.infer<typeof publicElectionClaimSchema>;
