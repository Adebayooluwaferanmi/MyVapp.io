export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        sub: string;
        email: string;
        role: string;
        tokenType?: "user" | "election_voter";
        electionId?: string;
        electionVoterId?: string;
        electionSessionId?: string;
        electionSessionJti?: string;
      };
      membership?: {
        organizationId: string;
        role: string;
      };
      organizationAccess?: {
        organizationId: string;
        exists: boolean;
      };
    }
  }
}
