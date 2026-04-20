import { ElectionResultsVisibility, ElectionStatus } from "@prisma/client";
import { z } from "zod";

export const organizationParamsSchema = z.object({
  organizationId: z.string().cuid()
});

export const electionParamsSchema = z.object({
  organizationId: z.string().cuid(),
  electionId: z.string().cuid()
});

export const officeParamsSchema = z.object({
  organizationId: z.string().cuid(),
  electionId: z.string().cuid(),
  officeId: z.string().cuid()
});

export const createElectionSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000).optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    resultsVisibilityMode: z.nativeEnum(ElectionResultsVisibility).optional(),
    lockAfterOpen: z.boolean().optional(),
    invalidatePriorSessionOnNewLogin: z.boolean().optional()
  })
  .refine(
    (data) => {
      if (!data.startsAt || !data.endsAt) {
        return true;
      }

      return new Date(data.endsAt) > new Date(data.startsAt);
    },
    {
      message: "endsAt must be later than startsAt.",
      path: ["endsAt"]
    }
  );

export const createOfficeSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  seats: z.coerce.number().int().min(1).max(20).default(1),
  sortOrder: z.coerce.number().int().min(0).default(0)
});

export const createCandidateSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  bio: z.string().trim().max(1000).optional(),
  manifesto: z.string().trim().max(5000).optional()
});

export const updateElectionStatusSchema = z.object({
  status: z.nativeEnum(ElectionStatus)
});

export type CreateElectionInput = z.infer<typeof createElectionSchema>;
export type CreateOfficeInput = z.infer<typeof createOfficeSchema>;
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type UpdateElectionStatusInput = z.infer<typeof updateElectionStatusSchema>;
