import { z } from "zod";

export const electionInvitesParamsSchema = z.object({
  organizationId: z.string().cuid(),
  electionId: z.string().cuid()
});

export const electionInviteVoterParamsSchema = electionInvitesParamsSchema.extend({
  electionVoterId: z.string().cuid()
});

export const sendElectionInvitesSchema = z.object({
  electionVoterIds: z.array(z.string().cuid()).min(1).max(500).optional(),
  search: z.string().trim().min(1).max(200).optional()
});

export type SendElectionInvitesInput = z.infer<typeof sendElectionInvitesSchema>;
