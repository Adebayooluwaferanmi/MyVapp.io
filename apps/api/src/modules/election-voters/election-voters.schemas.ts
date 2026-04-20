import { ElectionVoterStatus, ImportSourceFormat } from "@prisma/client";
import { z } from "zod";

export const electionVotersParamsSchema = z.object({
  organizationId: z.string().cuid(),
  electionId: z.string().cuid()
});

export const electionVoterImportParamsSchema = electionVotersParamsSchema.extend({
  importId: z.string().cuid()
});

export const listElectionVotersQuerySchema = z.object({
  status: z.nativeEnum(ElectionVoterStatus).optional(),
  search: z.string().trim().min(1).max(200).optional()
});

export const previewElectionVoterImportSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  format: z.nativeEnum(ImportSourceFormat),
  contentBase64: z.string().trim().min(1)
});

export const commitElectionVoterImportSchema = z.object({
  note: z.string().trim().max(500).optional()
});

export type ListElectionVotersQuery = z.infer<typeof listElectionVotersQuerySchema>;
export type PreviewElectionVoterImportInput = z.infer<typeof previewElectionVoterImportSchema>;
export type CommitElectionVoterImportInput = z.infer<typeof commitElectionVoterImportSchema>;
