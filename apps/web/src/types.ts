import type {
  OrganizationThemeInput,
  OrganizationThemeOverrides,
  OrganizationThemePreset
} from "./lib/theme";

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
  themePreset: OrganizationThemePreset;
  themeOverrides: OrganizationThemeOverrides | null;
  members?: Array<{
    role: string;
  }>;
  _count?: {
    elections: number;
    members: number;
  };
};

export type { OrganizationThemeInput, OrganizationThemeOverrides, OrganizationThemePreset };

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

export type AuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
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
  publicSlug?: string;
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

export type ElectionEligibilityStatus =
  | "PENDING"
  | "INVITED"
  | "CLAIMED"
  | "VOTED"
  | "REVOKED"
  | "EXPIRED";

export type ElectionEligibilityImportPreview = {
  importId: string;
  acceptedRows: Array<{
    rowNumber: number;
    memberUniqueId: string;
    fullName: string;
    age: number;
    email: string;
  }>;
  rejectedRows: Array<{
    rowNumber: number;
    values: Record<string, string | number | null>;
    errors: string[];
  }>;
  summary: {
    acceptedCount: number;
    rejectedCount: number;
  };
};

export type ElectionEligibilityImportCommitResponse = {
  importJob: {
    id: string;
    committedAt: string;
  };
  committedCount: number;
};

export type ElectionInvitationSendResponse = {
  message: string;
  sentCount: number;
  skippedCount: number;
  sent: Array<{
    eligibilityId: string;
    email: string;
    expiresAt: string;
  }>;
  skipped: Array<{
    eligibilityId: string;
    email: string;
    reason: string;
  }>;
};

export type ElectionEligibilityRecord = {
  id: string;
  memberUniqueId: string;
  fullName: string;
  age: number;
  email: string;
  status: ElectionEligibilityStatus;
  claimedAt: string | null;
  votedAt: string | null;
  createdAt: string;
  importJob: null | {
    id: string;
    filename: string;
    sourceFormat: "CSV" | "XLSX";
    committedAt: string | null;
    createdAt: string;
  };
  claimedBy: null | {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  latestInvite: null | {
    id: string;
    expiresAt: string;
    sentAt: string | null;
    usedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
  };
};

export type ElectionEligibilityRoster = {
  election: {
    id: string;
    title: string;
    slug: string;
    publicSlug: string;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
    organization: {
      id: string;
      name: string;
      slug: string;
    };
  };
  summary: {
    importedEligibleCount: number;
    invitesSentCount: number;
    claimedCount: number;
    votedCount: number;
    revokedCount: number;
    expiredCount: number;
    usedInviteCount: number;
    ballotsSubmitted: number;
  };
  eligibilities: ElectionEligibilityRecord[];
};

export type PublicElectionClaimContext = {
  election: {
    id: string;
    title: string;
    organizationName: string;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
  };
  invite: {
    expiresAt: string;
    claimed: boolean;
    revoked: boolean;
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
