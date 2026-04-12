export type CurrentUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
};

export type StoredSession = {
  token: string;
  user: CurrentUser;
};

export type AuthResponse = {
  token: string;
  user: CurrentUser;
  message: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  members?: Array<{
    role: string;
  }>;
  _count?: {
    elections: number;
    members: number;
  };
};

export type OrganizationMember = {
  id: string;
  organizationId: string;
  role: string;
  canVote: boolean;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    status: string;
  };
};

export type Candidate = {
  id: string;
  displayName: string;
  bio: string | null;
  manifesto?: string | null;
  createdAt?: string;
};

export type Office = {
  id: string;
  title: string;
  description: string | null;
  seats: number;
  sortOrder: number;
  createdAt?: string;
  candidates: Candidate[];
  _count?: {
    candidates: number;
    votes: number;
  };
};

export type ElectionSummary = {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  _count?: {
    offices: number;
    ballots: number;
  };
};

export type ElectionDetail = ElectionSummary & {
  offices: Office[];
  _count?: {
    ballots: number;
  };
};

export type Ballot = {
  id: string;
  submittedAt: string | null;
  votes: Array<{
    officeId: string;
    candidateId: string;
  }>;
};

export type BallotState = {
  election: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
  };
  offices: Office[];
  ballot: Ballot | null;
};

export type Results = {
  election: {
    id: string;
    title: string;
    status: string;
  };
  offices: Array<{
    officeId: string;
    title: string;
    seats: number;
    totalVotes: number;
    candidates: Array<{
      candidateId: string;
      displayName: string;
      votes: number;
    }>;
  }>;
};
