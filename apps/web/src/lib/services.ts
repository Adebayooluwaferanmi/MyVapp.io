import { apiRequest } from "./api";
import type {
  AuthResponse,
  BallotState,
  CurrentUser,
  ElectionDetail,
  ElectionSummary,
  OrganizationMember,
  Organization,
  Results
} from "../types";

type AuthCredentials = {
  email: string;
  password: string;
};

type RegisterPayload = AuthCredentials & {
  firstName: string;
  lastName: string;
};

type ElectionPayload = {
  title: string;
  description: string;
};

type OfficePayload = {
  title: string;
  description: string;
  seats: number;
};

type CandidatePayload = {
  displayName: string;
  bio: string;
};

export function getHealthStatus() {
  return apiRequest<{ status: string; service: string }>("/health");
}

export function register(payload: RegisterPayload) {
  return apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function login(payload: AuthCredentials) {
  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getCurrentUser(token: string) {
  return apiRequest<{ user: CurrentUser }>("/auth/me", { token });
}

export function listOrganizations(token: string) {
  return apiRequest<{ organizations: Organization[] }>("/organizations", { token });
}

export function createOrganization(
  token: string,
  payload: { name: string; description: string }
) {
  return apiRequest<{ organization: Organization }>("/organizations", {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function listOrganizationMembers(token: string, organizationId: string) {
  return apiRequest<{ members: OrganizationMember[] }>(`/organizations/${organizationId}/members`, {
    token
  });
}

export function createOrganizationMember(
  token: string,
  organizationId: string,
  payload: {
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  }
) {
  return apiRequest<{
    member: OrganizationMember;
    invited: boolean;
    message: string;
    temporaryPassword: string | null;
  }>(`/organizations/${organizationId}/members`, {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function updateOrganizationMemberRole(
  token: string,
  organizationId: string,
  memberId: string,
  role: string
) {
  return apiRequest<{
    member: OrganizationMember;
    message: string;
  }>(`/organizations/${organizationId}/members/${memberId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ role })
  });
}

export function listElections(token: string, organizationId: string) {
  return apiRequest<{ elections: ElectionSummary[] }>(`/organizations/${organizationId}/elections`, {
    token
  });
}

export function createElection(token: string, organizationId: string, payload: ElectionPayload) {
  return apiRequest<{ election: ElectionSummary }>(`/organizations/${organizationId}/elections`, {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function getElectionDetail(token: string, organizationId: string, electionId: string) {
  return apiRequest<{ election: ElectionDetail }>(
    `/organizations/${organizationId}/elections/${electionId}`,
    { token }
  );
}

export function getElectionBallot(token: string, organizationId: string, electionId: string) {
  return apiRequest<BallotState>(`/organizations/${organizationId}/elections/${electionId}/ballot`, {
    token
  });
}

export function getElectionResults(token: string, organizationId: string, electionId: string) {
  return apiRequest<Results>(`/organizations/${organizationId}/elections/${electionId}/results`, {
    token
  });
}

export function updateElectionStatus(
  token: string,
  organizationId: string,
  electionId: string,
  status: string
) {
  return apiRequest<{ election: ElectionSummary }>(
    `/organizations/${organizationId}/elections/${electionId}/status`,
    {
      method: "PATCH",
      token,
      body: JSON.stringify({ status })
    }
  );
}

export function createOffice(
  token: string,
  organizationId: string,
  electionId: string,
  payload: OfficePayload
) {
  return apiRequest(`/organizations/${organizationId}/elections/${electionId}/offices`, {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function createCandidate(
  token: string,
  organizationId: string,
  electionId: string,
  officeId: string,
  payload: CandidatePayload
) {
  return apiRequest(
    `/organizations/${organizationId}/elections/${electionId}/offices/${officeId}/candidates`,
    {
      method: "POST",
      token,
      body: JSON.stringify(payload)
    }
  );
}

export function submitBallot(
  token: string,
  organizationId: string,
  electionId: string,
  selections: Array<{ officeId: string; candidateId: string }>
) {
  return apiRequest(`/organizations/${organizationId}/elections/${electionId}/ballot`, {
    method: "POST",
    token,
    body: JSON.stringify({ selections })
  });
}
