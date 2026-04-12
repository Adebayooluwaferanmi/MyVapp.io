import { z } from "zod";

export const electionParamsSchema = z.object({
  organizationId: z.string().cuid(),
  electionId: z.string().cuid()
});

export const submitBallotSchema = z.object({
  selections: z
    .array(
      z.object({
        officeId: z.string().cuid(),
        candidateId: z.string().cuid()
      })
    )
    .min(1, "At least one office selection is required.")
});

export type SubmitBallotInput = z.infer<typeof submitBallotSchema>;
