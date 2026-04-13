import { ElectionEligibilityStatus, ImportSourceFormat } from "@prisma/client";
import { z } from "zod";

export const electionEligibilityParamsSchema = z.object({
  organizationId: z.string().cuid(),
  electionId: z.string().cuid()
});

export const eligibilityImportParamsSchema = electionEligibilityParamsSchema.extend({
  importId: z.string().cuid()
});

export const eligibilityInviteParamsSchema = electionEligibilityParamsSchema.extend({
  eligibilityId: z.string().cuid()
});

export const listElectionEligibilityQuerySchema = z.object({
  status: z.nativeEnum(ElectionEligibilityStatus).optional()
});

export const previewElectionEligibilityImportSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  format: z.nativeEnum(ImportSourceFormat)
});

export const commitElectionEligibilityImportSchema = z.object({
  note: z.string().trim().max(500).optional()
});

export const sendElectionInvitationsSchema = z.object({
  eligibilityIds: z.array(z.string().cuid()).min(1).max(500).optional()
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

export type ListElectionEligibilityQuery = z.infer<typeof listElectionEligibilityQuerySchema>;
export type PreviewElectionEligibilityImportInput = z.infer<typeof previewElectionEligibilityImportSchema>;
export type CommitElectionEligibilityImportInput = z.infer<typeof commitElectionEligibilityImportSchema>;
export type SendElectionInvitationsInput = z.infer<typeof sendElectionInvitationsSchema>;
export type PublicElectionClaimInput = z.infer<typeof publicElectionClaimSchema>;
