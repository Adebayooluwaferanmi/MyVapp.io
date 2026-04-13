import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  EmptyState as SharedEmptyState,
  MetricCard as SharedMetricCard,
  OrganizationThemeForm,
  PageHeader,
  PageShell,
  ReviewPanel,
  SectionCard,
  StatusBadge as SharedStatusBadge,
  WorkflowStep as SharedWorkflowStep
} from "@/components/shared/surfaces";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  commitElectionEligibilityImport,
  createOrganizationMember,
  createCandidate,
  createElection,
  createOffice,
  createOrganization,
  getElectionBallot,
  getElectionDetail,
  getElectionResults,
  listElections,
  listElectionEligibility,
  listOrganizationAuditLogs,
  listOrganizationMembers,
  listOrganizations,
  previewElectionEligibilityImport,
  resendElectionInvitation,
  sendElectionInvitations,
  submitBallot,
  updateOrganizationTheme,
  updateOrganizationMemberRole,
  updateElectionStatus
} from "@/lib/services";
import type { OrganizationThemeInput } from "@/lib/theme";
import type {
  AuditLog,
  BallotState,
  ElectionDetail,
  ElectionEligibilityImportPreview,
  ElectionEligibilityRoster,
  ElectionEligibilityStatus,
  ElectionSummary,
  OrganizationMember,
  Organization,
  Results,
  StoredSession
} from "@/types";

type WorkspaceProps = {
  healthMessage: string;
  onLogout: () => void;
  onRefreshProfile: () => Promise<void>;
  onThemeChange: (theme: OrganizationThemeInput) => void;
  session: StoredSession;
};

type Notice = {
  tone: "error" | "success";
  text: string;
};

type WorkflowTone = "ready" | "attention" | "locked";

const electionStatuses = ["DRAFT", "SCHEDULED", "OPEN", "CLOSED", "ARCHIVED"] as const;
const managerRoles = new Set(["OWNER", "ADMIN"]);
const membershipRoles = ["OWNER", "ADMIN", "MEMBER", "VOTER"] as const;
const workspaceSections = ["setup", "members", "structure", "vote", "results", "audit"] as const;

type WorkspaceSection = (typeof workspaceSections)[number];

const sectionLabelMap: Record<WorkspaceSection, string> = {
  members: "Members",
  setup: "Setup",
  structure: "Structure",
  vote: "Vote",
  results: "Results",
  audit: "Audit"
};

const sectionHintMap: Record<WorkspaceSection, string> = {
  members: "Add members, update roles, and control ballot access.",
  setup: "Create elections and update their status.",
  structure: "Add offices and candidates for the selected election.",
  vote: "Review the ballot and submit one choice per office.",
  results: "View results for the selected election.",
  audit: "Review recent account, membership, and ballot activity."
};

const initialOrganizationForm: {
  name: string;
  description: string;
  themePreset: OrganizationThemeInput["themePreset"];
} = {
  name: "",
  description: "",
  themePreset: "myvapp-default"
};

const initialElectionForm = {
  title: "",
  description: ""
};

const initialOfficeForm = {
  title: "",
  description: "",
  seats: 1
};

const initialCandidateForm = {
  officeId: "",
  displayName: "",
  bio: ""
};

const initialMemberForm = {
  firstName: "",
  lastName: "",
  email: "",
  role: "VOTER"
};

const eligibilityStatusOptions = ["ALL", "PENDING", "INVITED", "CLAIMED", "VOTED", "REVOKED", "EXPIRED"] as const;

type EligibilityFilterValue = (typeof eligibilityStatusOptions)[number];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result !== "string") {
        reject(new Error("The selected file could not be read."));
        return;
      }

      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };

    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
}

function resolveImportFormat(fileName: string): "CSV" | "XLSX" | null {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".csv")) {
    return "CSV";
  }

  if (lower.endsWith(".xlsx")) {
    return "XLSX";
  }

  return null;
}

function formatInviteSkipReason(reason: string) {
  switch (reason) {
    case "already_claimed":
      return "Already claimed";
    case "already_voted":
      return "Already voted";
    case "revoked":
      return "Revoked";
    case "expired":
      return "Expired";
    case "already_sent":
      return "Already sent";
    default:
      return toTitleCase(reason);
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Not scheduled";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAuditAction(action: string): string {
  return action
    .split(".")
    .map((part) => toTitleCase(part))
    .join(" · ");
}

function formatAuditMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata) {
    return "No additional metadata";
  }

  const parts = Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 4)
    .map(([key, value]) => `${toTitleCase(key)}: ${String(value)}`);

  return parts.length > 0 ? parts.join(" · ") : "No additional metadata";
}

function StatusPill({ status }: { status: string }) {
  return <SharedStatusBadge status={status} />;
}

function EmptyPanel({
  body,
  title
}: {
  body: string;
  title: string;
}) {
  return (
    <SharedEmptyState body={body} title={title} />
  );
}

function MetricCard({
  label,
  value
}: {
  label: string;
  value: number | string;
}) {
  return (
    <SharedMetricCard label={label} value={value} />
  );
}

function WorkflowCard({
  description,
  isActive,
  isDisabled = false,
  label,
  meta,
  onClick,
  tone
}: {
  description: string;
  isActive: boolean;
  isDisabled?: boolean;
  label: string;
  meta: string;
  onClick: () => void;
  tone: WorkflowTone;
}) {
  return (
    <button
      className={`group rounded-[var(--radius)] border p-4 text-left transition ${
        isActive
          ? "border-[color:var(--primary)]/35 bg-[color:var(--secondary)]/70"
          : tone === "ready"
            ? "border-[color:var(--success)]/15 bg-white hover:bg-[color:var(--muted)]/60"
            : "border-[color:var(--border)] bg-white hover:bg-[color:var(--muted)]/60"
      }`}
      disabled={isDisabled}
      onClick={onClick}
      type="button"
    >
      <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">{label}</span>
      <strong className="mt-3 block text-base">{meta}</strong>
      <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{description}</p>
    </button>
  );
}

function ReadinessItem({
  label,
  meta,
  tone
}: {
  label: string;
  meta: string;
  tone: WorkflowTone;
}) {
  return (
    <div
      className={`rounded-[calc(var(--radius)-0.25rem)] border p-4 ${
        tone === "ready"
          ? "border-[color:var(--success)]/20 bg-[color:var(--success)]/10"
          : tone === "attention"
            ? "border-[color:var(--warning)]/20 bg-[color:var(--warning)]/10"
            : "border-[color:var(--border)] bg-[color:var(--muted)]/60"
      }`}
    >
      <span className="block text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">{label}</span>
      <strong className="mt-2 block">{meta}</strong>
    </div>
  );
}

export function Workspace({ healthMessage, onLogout, onRefreshProfile, onThemeChange, session }: WorkspaceProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState<string | null>(null);
  const [electionDetail, setElectionDetail] = useState<ElectionDetail | null>(null);
  const [ballotState, setBallotState] = useState<BallotState | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [isLoadingOrganizations, setIsLoadingOrganizations] = useState(true);
  const [isLoadingElections, setIsLoadingElections] = useState(false);
  const [isLoadingElectionWorkspace, setIsLoadingElectionWorkspace] = useState(false);
  const [organizationForm, setOrganizationForm] = useState(initialOrganizationForm);
  const [electionForm, setElectionForm] = useState(initialElectionForm);
  const [officeForm, setOfficeForm] = useState(initialOfficeForm);
  const [candidateForm, setCandidateForm] = useState(initialCandidateForm);
  const [memberForm, setMemberForm] = useState(initialMemberForm);
  const [themeForm, setThemeForm] = useState<OrganizationThemeInput>({
    themePreset: "myvapp-default"
  });
  const [ballotSelections, setBallotSelections] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("setup");
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isLoadingAuditLogs, setIsLoadingAuditLogs] = useState(false);
  const [eligibilityRoster, setEligibilityRoster] = useState<ElectionEligibilityRoster | null>(null);
  const [isLoadingEligibility, setIsLoadingEligibility] = useState(false);
  const [eligibilityFilter, setEligibilityFilter] = useState<EligibilityFilterValue>("ALL");
  const [registryFile, setRegistryFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ElectionEligibilityImportPreview | null>(null);
  const [importInputKey, setImportInputKey] = useState(0);

  const selectedOrganization = useMemo(
    () => organizations.find((organization) => organization.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId]
  );

  const membershipRole = useMemo(() => {
    if (session.user.role === "SUPER_ADMIN") {
      return "OWNER";
    }

    return selectedOrganization?.members?.[0]?.role ?? null;
  }, [selectedOrganization, session.user.role]);

  const canManageSelectedOrganization =
    session.user.role === "SUPER_ADMIN" || (membershipRole ? managerRoles.has(membershipRole) : false);

  const currentOffices = electionDetail?.offices ?? ballotState?.offices ?? [];
  const candidateCount =
    electionDetail?.offices.reduce((total, office) => total + office.candidates.length, 0) ?? 0;
  const hasBallotChoices = Boolean(ballotState && ballotState.offices.length > 0);
  const hasSubmittedBallot = Boolean(ballotState?.ballot);
  const hasResults = Boolean(results && results.offices.length > 0);
  const hasAuditLogs = auditLogs.length > 0;
  const ballotIsOpen = ballotState?.election.status === "OPEN";
  const eligibleVoterCount = useMemo(
    () => members.filter((member) => member.canVote).length,
    [members]
  );
  const totalBallotOffices = ballotState?.offices.length ?? 0;
  const selectedBallotCount = Object.values(ballotSelections).filter(Boolean).length;
  const ballotCompletionPercent =
    totalBallotOffices === 0 ? 0 : Math.round((selectedBallotCount / totalBallotOffices) * 100);

  const ballotReviewItems = useMemo(() => {
    if (!ballotState) {
      return [];
    }

    return ballotState.offices.map((office) => {
      const selectedCandidateId = ballotSelections[office.id];
      const selectedCandidate = office.candidates.find((candidate) => candidate.id === selectedCandidateId);

      return {
        officeId: office.id,
        officeTitle: office.title,
        candidateName: selectedCandidate?.displayName ?? null
      };
    });
  }, [ballotSelections, ballotState]);

  const metrics = useMemo(() => {
    const officeCount = electionDetail?.offices.length ?? 0;

    return {
      organizations: organizations.length,
      elections: elections.length,
      offices: officeCount,
      candidates: candidateCount,
      ballots: electionDetail?._count?.ballots ?? results?.offices.reduce((total, office) => total + office.totalVotes, 0) ?? 0
    };
  }, [candidateCount, electionDetail, elections.length, organizations.length, results]);

  const workflowCards = useMemo<
    Array<{
      section: WorkspaceSection;
      tone: WorkflowTone;
      meta: string;
      description: string;
      disabled: boolean;
    }>
  >(() => {
    const selectedElectionLabel = electionDetail?.title ?? "No election selected";

    return [
      {
        section: "members" as const,
        tone: members.length > 1 ? "ready" : selectedOrganization ? "attention" : "locked",
        meta: `${members.length} organization members`,
        description: selectedOrganization
          ? "Add people and choose who can vote before voting starts."
          : "Choose an organization before managing members.",
        disabled: !selectedOrganization
      },
      {
        section: "setup" as const,
        tone: selectedElectionId ? "ready" : "attention",
        meta: selectedElectionLabel,
        description: selectedElectionId
          ? `Status is ${toTitleCase(electionDetail?.status ?? "draft")}. Update dates and status here.`
          : "Create or choose an election before moving on.",
        disabled: false
      },
      {
        section: "structure" as const,
        tone: currentOffices.length > 0 ? "ready" : selectedElectionId ? "attention" : "locked",
        meta: `${currentOffices.length} offices · ${candidateCount} candidates`,
        description: selectedElectionId
          ? "Add the offices and candidates that will appear on the ballot."
          : "Choose an election first.",
        disabled: !selectedElectionId
      },
      {
        section: "vote" as const,
        tone:
          electionDetail?.status === "OPEN" && hasBallotChoices
            ? "ready"
            : selectedElectionId
              ? "attention"
              : "locked",
        meta: hasSubmittedBallot ? "Ballot submitted" : electionDetail?.status === "OPEN" ? "Voting open" : "Voting closed",
        description: hasBallotChoices
          ? "The ballot is ready for testing or live voting."
          : "Add offices and candidates, then open the election.",
        disabled: !selectedElectionId
      },
      {
        section: "results" as const,
        tone: hasResults ? "ready" : selectedElectionId ? "attention" : "locked",
        meta: hasResults ? `${results?.offices.length ?? 0} office tallies available` : "Awaiting counted votes",
        description: canManageSelectedOrganization
          ? "Managers can review vote totals here."
          : "Only managers can view results.",
        disabled: !selectedElectionId
      },
      {
        section: "audit" as const,
        tone: hasAuditLogs ? "ready" : selectedOrganization ? "attention" : "locked",
        meta: hasAuditLogs ? `${auditLogs.length} recent audit events` : "No recent audit events",
        description: canManageSelectedOrganization
          ? "Review recent actions without exposing ballot choices."
          : "Only managers can view the audit log.",
        disabled: !selectedOrganization || !canManageSelectedOrganization
      }
    ];
  }, [
    auditLogs.length,
    candidateCount,
    canManageSelectedOrganization,
    currentOffices.length,
    electionDetail?.status,
    electionDetail?.title,
    hasAuditLogs,
    hasBallotChoices,
    hasResults,
    hasSubmittedBallot,
    members.length,
    results?.offices.length,
    selectedOrganization,
    selectedElectionId
  ]);

  const recommendedStep = useMemo(() => {
    if (!selectedOrganization) {
      return {
        title: "Choose an organization",
        body: "Create a new organization or pick one from the list to get started.",
        section: "setup" as const,
        actionLabel: "Get started"
      };
    }

    if (!selectedElectionId) {
      return {
        title: "Create or choose an election",
        body: "Pick the election you want to work on before adding offices or candidates.",
        section: "setup" as const,
        actionLabel: "Create election"
      };
    }

    if (eligibleVoterCount === 0) {
      return {
        title: "Add voters",
        body: "Give at least one member ballot access before you open voting.",
        section: "members" as const,
        actionLabel: "Manage members"
      };
    }

    if (currentOffices.length === 0) {
      return {
        title: "Add offices",
        body: "Set up the roles voters will choose from.",
        section: "structure" as const,
        actionLabel: "Build the ballot"
      };
    }

    if (candidateCount === 0) {
      return {
        title: "Add candidates",
        body: "The offices are ready. Now add the candidates who will appear on the ballot.",
        section: "structure" as const,
        actionLabel: "Add candidates"
      };
    }

    if (electionDetail?.status !== "OPEN") {
      return {
        title: "Open voting",
        body: "When the ballot is ready, change the election status to OPEN.",
        section: "setup" as const,
        actionLabel: "Open election"
      };
    }

    if (!hasSubmittedBallot) {
      return {
        title: "Voting is open",
        body: "You can review the ballot here or invite members to vote.",
        section: "vote" as const,
        actionLabel: "Open ballot"
      };
    }

    return {
      title: "Review progress",
      body: canManageSelectedOrganization
        ? "Voting is underway. Check results and the audit log as needed."
        : "Voting is underway. Open the ballot view to review the flow.",
      section: canManageSelectedOrganization ? ("results" as const) : ("vote" as const),
      actionLabel: canManageSelectedOrganization ? "Review results" : "Revisit ballot"
    };
  }, [
    canManageSelectedOrganization,
    candidateCount,
    currentOffices.length,
    electionDetail?.status,
    hasSubmittedBallot,
    members,
    selectedElectionId,
    selectedOrganization
  ]);

  const readinessItems = useMemo(
    () => [
      {
        label: "Access",
        meta:
          eligibleVoterCount > 0
            ? `${eligibleVoterCount} eligible voter${eligibleVoterCount === 1 ? "" : "s"}`
            : "No eligible voters yet",
        tone: eligibleVoterCount > 0 ? ("ready" as const) : selectedOrganization ? ("attention" as const) : ("locked" as const)
      },
      {
        label: "Election",
        meta: selectedElectionId ? electionDetail?.title ?? "Loading election…" : "No election selected",
        tone: selectedElectionId ? ("ready" as const) : ("attention" as const)
      },
      {
        label: "Ballot",
        meta:
          currentOffices.length > 0 && candidateCount > 0
            ? `${currentOffices.length} offices · ${candidateCount} candidates`
            : selectedElectionId
              ? "Ballot still being assembled"
              : "Locked until election is chosen",
        tone:
          currentOffices.length > 0 && candidateCount > 0
            ? ("ready" as const)
            : selectedElectionId
              ? ("attention" as const)
              : ("locked" as const)
      },
      {
        label: "Voting",
        meta:
          electionDetail?.status === "OPEN"
            ? "Accepting ballots now"
            : selectedElectionId
              ? `Status: ${toTitleCase(electionDetail?.status ?? "draft")}`
              : "Not available yet",
        tone:
          electionDetail?.status === "OPEN"
            ? ("ready" as const)
            : selectedElectionId
              ? ("attention" as const)
              : ("locked" as const)
      }
    ],
    [
      candidateCount,
      currentOffices.length,
      electionDetail?.status,
      electionDetail?.title,
      eligibleVoterCount,
      selectedElectionId,
      selectedOrganization
    ]
  );

  useEffect(() => {
    void loadOrganizations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      setMembers([]);
      setAuditLogs([]);
      setElections([]);
      setSelectedElectionId(null);
      setElectionDetail(null);
      setBallotState(null);
      setResults(null);
      setResultsError(null);
      return;
    }

    void loadElections(selectedOrganizationId);
    if (canManageSelectedOrganization) {
      void loadMembers(selectedOrganizationId);
      void loadAuditLogs(selectedOrganizationId);
    } else {
      setMembers([]);
      setAuditLogs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId, session.token, canManageSelectedOrganization]);

  useEffect(() => {
    if (!selectedOrganizationId || !selectedElectionId) {
      setElectionDetail(null);
      setBallotState(null);
      setResults(null);
      setResultsError(null);
      return;
    }

    void loadElectionWorkspace(selectedOrganizationId, selectedElectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElectionId, selectedOrganizationId, session.token, canManageSelectedOrganization]);

  useEffect(() => {
    if (!selectedOrganizationId || !selectedElectionId || !canManageSelectedOrganization) {
      setEligibilityRoster(null);
      setImportPreview(null);
      return;
    }

    void loadEligibilityRoster(
      selectedOrganizationId,
      selectedElectionId,
      eligibilityFilter === "ALL" ? undefined : eligibilityFilter
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElectionId, selectedOrganizationId, session.token, canManageSelectedOrganization, eligibilityFilter]);

  useEffect(() => {
    if (currentOffices.length === 0) {
      setCandidateForm((current) => ({ ...current, officeId: "" }));
      return;
    }

    setCandidateForm((current) => {
      if (current.officeId && currentOffices.some((office) => office.id === current.officeId)) {
        return current;
      }

      return {
        ...current,
        officeId: currentOffices[0].id
      };
    });
  }, [currentOffices]);

  useEffect(() => {
    if (!ballotState) {
      setBallotSelections({});
      return;
    }

    if (ballotState.ballot) {
      const submittedSelections = ballotState.ballot.votes.reduce<Record<string, string>>((accumulator, vote) => {
        accumulator[vote.officeId] = vote.candidateId;
        return accumulator;
      }, {});

      setBallotSelections(submittedSelections);
      return;
    }

    setBallotSelections((current) =>
      ballotState.offices.reduce<Record<string, string>>((accumulator, office) => {
        accumulator[office.id] = current[office.id] ?? "";
        return accumulator;
      }, {})
    );
  }, [ballotState]);

  useEffect(() => {
    setThemeForm({
      themePreset: selectedOrganization?.themePreset ?? "myvapp-default",
      themeOverrides: selectedOrganization?.themeOverrides ?? undefined
    });
    onThemeChange(
      selectedOrganization
        ? {
            themePreset: selectedOrganization.themePreset,
            themeOverrides: selectedOrganization.themeOverrides ?? undefined
          }
        : { themePreset: "myvapp-default" }
    );
  }, [onThemeChange, selectedOrganization]);

  useEffect(() => {
    if (!selectedElectionId && activeSection !== "setup") {
      setActiveSection("setup");
    }
  }, [activeSection, selectedElectionId]);

  async function loadOrganizations(preferredOrganizationId?: string) {
    setIsLoadingOrganizations(true);

    try {
      const response = await listOrganizations(session.token);

      setOrganizations(response.organizations);
      setSelectedOrganizationId((current) => {
        if (preferredOrganizationId && response.organizations.some((organization) => organization.id === preferredOrganizationId)) {
          return preferredOrganizationId;
        }

        if (current && response.organizations.some((organization) => organization.id === current)) {
          return current;
        }

        return response.organizations[0]?.id ?? null;
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to load organizations."
      });
    } finally {
      setIsLoadingOrganizations(false);
    }
  }

  async function loadElections(organizationId: string, preferredElectionId?: string) {
    setIsLoadingElections(true);

    try {
      const response = await listElections(session.token, organizationId);

      setElections(response.elections);
      setSelectedElectionId((current) => {
        if (preferredElectionId && response.elections.some((election) => election.id === preferredElectionId)) {
          return preferredElectionId;
        }

        if (current && response.elections.some((election) => election.id === current)) {
          return current;
        }

        return response.elections[0]?.id ?? null;
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to load elections."
      });
      setElections([]);
      setSelectedElectionId(null);
    } finally {
      setIsLoadingElections(false);
    }
  }

  async function loadMembers(organizationId: string) {
    setIsLoadingMembers(true);

    try {
      const response = await listOrganizationMembers(session.token, organizationId);
      setMembers(response.members);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to load organization members."
      });
      setMembers([]);
    } finally {
      setIsLoadingMembers(false);
    }
  }

  async function loadAuditLogs(organizationId: string) {
    setIsLoadingAuditLogs(true);

    try {
      const response = await listOrganizationAuditLogs(session.token, organizationId, 25);
      setAuditLogs(response.auditLogs);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to load audit logs."
      });
      setAuditLogs([]);
    } finally {
      setIsLoadingAuditLogs(false);
    }
  }

  async function loadEligibilityRoster(
    organizationId: string,
    electionId: string,
    status?: ElectionEligibilityStatus
  ) {
    setIsLoadingEligibility(true);

    try {
      const response = await listElectionEligibility(session.token, organizationId, electionId, status);
      setEligibilityRoster(response);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to load the voter registry."
      });
      setEligibilityRoster(null);
    } finally {
      setIsLoadingEligibility(false);
    }
  }

  async function loadElectionWorkspace(organizationId: string, electionId: string) {
    setIsLoadingElectionWorkspace(true);

    try {
      const [detailResponse, ballotResponse] = await Promise.all([
        getElectionDetail(session.token, organizationId, electionId),
        getElectionBallot(session.token, organizationId, electionId)
      ]);

      setElectionDetail(detailResponse.election);
      setBallotState(ballotResponse);

      if (canManageSelectedOrganization) {
        try {
          const resultsResponse = await getElectionResults(session.token, organizationId, electionId);

          setResults(resultsResponse);
          setResultsError(null);
        } catch (error) {
          setResults(null);
          setResultsError(error instanceof Error ? error.message : "Unable to load results.");
        }
      } else {
        setResults(null);
        setResultsError("Results are only available to organization managers.");
      }
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to load election workspace."
      });
      setElectionDetail(null);
      setBallotState(null);
      setResults(null);
      setResultsError(null);
    } finally {
      setIsLoadingElectionWorkspace(false);
    }
  }

  async function handleCreateOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveAction("create-organization");
    setNotice(null);

    try {
      const response = await createOrganization(session.token, organizationForm);

      setOrganizationForm(initialOrganizationForm);
      setNotice({
        tone: "success",
        text: `Organization "${response.organization.name}" created successfully.`
      });
      await loadOrganizations(response.organization.id);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to create organization."
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleUpdateTheme() {
    if (!selectedOrganizationId) {
      return;
    }

    setActiveAction("update-theme");
    setNotice(null);

    try {
      const response = await updateOrganizationTheme(session.token, selectedOrganizationId, themeForm);

      setNotice({
        tone: "success",
        text: `Organization theme for "${response.organization.name}" updated successfully.`
      });
      await loadOrganizations(selectedOrganizationId);
      await loadAuditLogs(selectedOrganizationId);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to update organization theme."
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleCreateElection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrganizationId) {
      return;
    }

    setActiveAction("create-election");
    setNotice(null);

    try {
      const response = await createElection(session.token, selectedOrganizationId, electionForm);

      setElectionForm(initialElectionForm);
      setNotice({
        tone: "success",
        text: `Election "${response.election.title}" created successfully.`
      });
      await loadElections(selectedOrganizationId, response.election.id);
      if (canManageSelectedOrganization) {
        await loadAuditLogs(selectedOrganizationId);
      }
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to create election."
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleElectionStatusUpdate(status: string) {
    if (!selectedOrganizationId || !selectedElectionId) {
      return;
    }

    setActiveAction(`status-${status}`);
    setNotice(null);

    try {
      await updateElectionStatus(session.token, selectedOrganizationId, selectedElectionId, status);

      setNotice({
        tone: "success",
        text: `Election status changed to ${toTitleCase(status)}.`
      });
      await loadElections(selectedOrganizationId, selectedElectionId);
      await loadElectionWorkspace(selectedOrganizationId, selectedElectionId);
      if (canManageSelectedOrganization) {
        await loadAuditLogs(selectedOrganizationId);
      }
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to update election status."
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleCreateOffice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrganizationId || !selectedElectionId) {
      return;
    }

    setActiveAction("create-office");
    setNotice(null);

    try {
      await createOffice(session.token, selectedOrganizationId, selectedElectionId, officeForm);

      setOfficeForm(initialOfficeForm);
      setNotice({
        tone: "success",
        text: `Office "${officeForm.title}" created successfully.`
      });
      await loadElections(selectedOrganizationId, selectedElectionId);
      await loadElectionWorkspace(selectedOrganizationId, selectedElectionId);
      if (canManageSelectedOrganization) {
        await loadAuditLogs(selectedOrganizationId);
      }
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to create office."
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleCreateCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrganizationId || !selectedElectionId || !candidateForm.officeId) {
      return;
    }

    setActiveAction("create-candidate");
    setNotice(null);

    try {
      await createCandidate(session.token, selectedOrganizationId, selectedElectionId, candidateForm.officeId, {
        displayName: candidateForm.displayName,
        bio: candidateForm.bio
      });

      setCandidateForm((current) => ({
        ...current,
        displayName: "",
        bio: ""
      }));
      setNotice({
        tone: "success",
        text: "Candidate created successfully."
      });
      await loadElectionWorkspace(selectedOrganizationId, selectedElectionId);
      if (canManageSelectedOrganization) {
        await loadAuditLogs(selectedOrganizationId);
      }
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to create candidate."
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleCreateMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrganizationId) {
      return;
    }

    setActiveAction("create-member");
    setNotice(null);

    try {
      const response = await createOrganizationMember(session.token, selectedOrganizationId, memberForm);

      setMemberForm(initialMemberForm);
      setNotice({
        tone: "success",
        text: response.invited && response.temporaryPassword
          ? `Member invited. Temporary password for ${response.member.user.email}: ${response.temporaryPassword}`
          : `${response.member.user.email} was added to the organization successfully.`
      });
      await loadMembers(selectedOrganizationId);
      await loadAuditLogs(selectedOrganizationId);
      await loadOrganizations(selectedOrganizationId);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to add organization member."
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleUpdateMemberRole(memberId: string, role: string) {
    if (!selectedOrganizationId) {
      return;
    }

    setActiveAction(`member-role-${memberId}`);
    setNotice(null);

    try {
      const response = await updateOrganizationMemberRole(
        session.token,
        selectedOrganizationId,
        memberId,
        role
      );

      setNotice({
        tone: "success",
        text: `${response.member.user.email} is now assigned as ${toTitleCase(role)}.`
      });
      await loadMembers(selectedOrganizationId);
      await loadAuditLogs(selectedOrganizationId);
      await loadOrganizations(selectedOrganizationId);
      await onRefreshProfile();
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to update organization member role."
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleSubmitBallot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrganizationId || !selectedElectionId) {
      return;
    }

    const selections = Object.entries(ballotSelections)
      .filter(([, candidateId]) => candidateId)
      .map(([officeId, candidateId]) => ({
        officeId,
        candidateId
      }));

    if (selections.length === 0) {
      setNotice({
        tone: "error",
        text: "Select at least one candidate before submitting your ballot."
      });
      return;
    }

    setActiveAction("submit-ballot");
    setNotice(null);

    try {
      await submitBallot(session.token, selectedOrganizationId, selectedElectionId, selections);

      setNotice({
        tone: "success",
        text: "Ballot submitted successfully."
      });
      await loadElectionWorkspace(selectedOrganizationId, selectedElectionId);
      if (canManageSelectedOrganization) {
        await loadAuditLogs(selectedOrganizationId);
      }
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to submit ballot."
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handlePreviewEligibilityImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrganizationId || !selectedElectionId) {
      return;
    }

    if (!registryFile) {
      setNotice({
        tone: "error",
        text: "Choose a CSV or XLSX file before previewing the voter registry."
      });
      return;
    }

    const format = resolveImportFormat(registryFile.name);

    if (!format) {
      setNotice({
        tone: "error",
        text: "Only CSV and XLSX files are supported for the voter registry."
      });
      return;
    }

    setActiveAction("preview-registry-import");
    setNotice(null);

    try {
      const contentBase64 = await readFileAsBase64(registryFile);
      const response = await previewElectionEligibilityImport(session.token, selectedOrganizationId, selectedElectionId, {
        filename: registryFile.name,
        format,
        contentBase64
      });

      setImportPreview(response);
      setNotice({
        tone: "success",
        text: `Preview ready. ${response.summary.acceptedCount} row${response.summary.acceptedCount === 1 ? "" : "s"} accepted and ${response.summary.rejectedCount} rejected.`
      });
    } catch (error) {
      setImportPreview(null);
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to preview the voter registry."
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleCommitEligibilityImport() {
    if (!selectedOrganizationId || !selectedElectionId || !importPreview) {
      return;
    }

    setActiveAction("commit-registry-import");
    setNotice(null);

    try {
      const response = await commitElectionEligibilityImport(
        session.token,
        selectedOrganizationId,
        selectedElectionId,
        importPreview.importId,
        {}
      );

      setImportPreview(null);
      setRegistryFile(null);
      setImportInputKey((current) => current + 1);
      setNotice({
        tone: "success",
        text: `Committed ${response.committedCount} voter registry row${response.committedCount === 1 ? "" : "s"}.`
      });
      await loadEligibilityRoster(
        selectedOrganizationId,
        selectedElectionId,
        eligibilityFilter === "ALL" ? undefined : eligibilityFilter
      );
      await loadAuditLogs(selectedOrganizationId);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to commit the voter registry."
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleSendElectionInvites() {
    if (!selectedOrganizationId || !selectedElectionId) {
      return;
    }

    setActiveAction("send-election-invites");
    setNotice(null);

    try {
      const response = await sendElectionInvitations(session.token, selectedOrganizationId, selectedElectionId);
      setNotice({
        tone: "success",
        text: `${response.message} ${response.skippedCount > 0 ? `${response.skippedCount} record${response.skippedCount === 1 ? " was" : "s were"} skipped.` : ""}`.trim()
      });
      await loadEligibilityRoster(
        selectedOrganizationId,
        selectedElectionId,
        eligibilityFilter === "ALL" ? undefined : eligibilityFilter
      );
      await loadAuditLogs(selectedOrganizationId);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to send election invites."
      });
    } finally {
      setActiveAction(null);
    }
  }

  async function handleResendElectionInvite(eligibilityId: string) {
    if (!selectedOrganizationId || !selectedElectionId) {
      return;
    }

    setActiveAction(`resend-election-invite-${eligibilityId}`);
    setNotice(null);

    try {
      const response = await resendElectionInvitation(
        session.token,
        selectedOrganizationId,
        selectedElectionId,
        eligibilityId
      );
      setNotice({
        tone: "success",
        text: response.message
      });
      await loadEligibilityRoster(
        selectedOrganizationId,
        selectedElectionId,
        eligibilityFilter === "ALL" ? undefined : eligibilityFilter
      );
      await loadAuditLogs(selectedOrganizationId);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to resend the invite."
      });
    } finally {
      setActiveAction(null);
    }
  }

  const hasElectionWorkspace = Boolean(selectedElectionId && electionDetail);
  const selectedElectionSummary = elections.find((election) => election.id === selectedElectionId) ?? null;
  const sectionDisabled = (section: WorkspaceSection) =>
    section === "setup"
      ? false
      : section === "members" || section === "audit"
        ? !selectedOrganization
        : !hasElectionWorkspace;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Workspace"
        title={`${session.user.firstName}, here's your workspace.`}
        description="Create organizations, set up elections, manage members, and review results in one place."
        actions={
          <>
            <Button onClick={() => void onRefreshProfile()} type="button" variant="outline">
              Refresh profile
            </Button>
            <Button onClick={onLogout} type="button">
              Logout
            </Button>
          </>
        }
        meta={
          <>
            <Badge variant="success">{healthMessage}</Badge>
            <Badge variant="outline">Signed in as {toTitleCase(session.user.role)}</Badge>
            {membershipRole ? <StatusPill status={membershipRole} /> : null}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Organizations" value={metrics.organizations} />
        <MetricCard label="Elections" value={metrics.elections} />
        <MetricCard label="Offices" value={metrics.offices} />
        <MetricCard label="Candidates" value={metrics.candidates} />
        <MetricCard label="Counted votes" value={metrics.ballots} />
      </div>

      {notice ? (
        <Alert variant={notice.tone === "success" ? "success" : "destructive"}>
          <AlertTitle>{notice.tone === "success" ? "Saved" : "Action needed"}</AlertTitle>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-6">
          <SectionCard title="Session" description="Account details for this signed-in user.">
            <div className="space-y-2">
              <p className="font-semibold">
                {session.user.firstName} {session.user.lastName}
              </p>
              <p className="text-sm text-[color:var(--muted-foreground)]">{session.user.email}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusPill status={session.user.role} />
              {membershipRole ? <Badge variant="outline">Organization role: {toTitleCase(membershipRole)}</Badge> : null}
            </div>
          </SectionCard>

          <SectionCard
            title="Create organization"
            description="Add a new organization and choose its starting theme."
          >
            <form className="space-y-4" onSubmit={handleCreateOrganization}>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="organization-name">
                  Organization name
                </label>
                <Input
                  id="organization-name"
                  required
                  value={organizationForm.name}
                  onChange={(event) =>
                    setOrganizationForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="organization-description">
                  Description
                </label>
                <Textarea
                  id="organization-description"
                  rows={3}
                  value={organizationForm.description}
                  onChange={(event) =>
                    setOrganizationForm((current) => ({
                      ...current,
                      description: event.target.value
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Theme preset</label>
                <Select
                  value={organizationForm.themePreset}
                  onValueChange={(value) =>
                    setOrganizationForm((current) => ({
                      ...current,
                      themePreset: value as OrganizationThemeInput["themePreset"]
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a preset" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="myvapp-default">MyVapp Default</SelectItem>
                    <SelectItem value="civic-blue">Civic Blue</SelectItem>
                    <SelectItem value="emerald-hall">Emerald Hall</SelectItem>
                    <SelectItem value="sunrise-coral">Sunrise Coral</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button className="w-full" disabled={activeAction === "create-organization"} type="submit">
                {activeAction === "create-organization" ? "Creating organization..." : "Create organization"}
              </Button>
            </form>
          </SectionCard>

          <SectionCard
            title="Organizations"
            description="Choose the organization you're working on."
            action={isLoadingOrganizations ? <Badge variant="outline">Loading...</Badge> : undefined}
          >
            {organizations.length === 0 ? (
              <SharedEmptyState
                title="No organizations yet"
                body="Create your first organization to get started."
              />
            ) : (
              <div className="space-y-3">
                {organizations.map((organization) => {
                  const isSelected = organization.id === selectedOrganizationId;

                  return (
                    <button
                      key={organization.id}
                      className={`w-full rounded-[var(--radius)] border p-4 text-left transition ${
                        isSelected
                          ? "border-[color:var(--primary)]/30 bg-[color:var(--secondary)]/70 shadow-sm"
                          : "border-[color:var(--border)] bg-white hover:bg-[color:var(--muted)]/60"
                      }`}
                      onClick={() => setSelectedOrganizationId(organization.id)}
                      type="button"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{organization.name}</p>
                            <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                              {organization.description ?? "No description yet."}
                            </p>
                          </div>
                          <StatusPill status={organization.themePreset} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{organization._count?.elections ?? 0} elections</Badge>
                          <Badge variant="outline">{organization._count?.members ?? 1} members</Badge>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          {!selectedOrganization ? (
            <EmptyPanel
              title="No organization selected"
              body="Create an organization or choose one from the list."
            />
          ) : (
            <>
              <SectionCard
                title={selectedOrganization.name}
                description={selectedOrganization.description ?? "Set up elections, members, and branding for this organization."}
                action={
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{selectedOrganization._count?.elections ?? elections.length} elections</Badge>
                    <Badge variant="outline">{selectedOrganization._count?.members ?? 1} members</Badge>
                    {membershipRole ? <StatusPill status={membershipRole} /> : null}
                  </div>
                }
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
                  <Card className="border-white/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--card)_94%,white),color-mix(in_srgb,var(--secondary)_55%,white))]">
                    <CardContent className="space-y-4 p-6">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--primary)]">
                          Next step
                        </p>
                        <h3 className="font-[family:var(--font-heading)] text-3xl leading-tight">
                          {recommendedStep.title}
                        </h3>
                        <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">{recommendedStep.body}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {selectedElectionId ? `Election: ${electionDetail?.title ?? "Loading..."}` : "No election selected"}
                        </Badge>
                        <Badge variant="outline">{currentOffices.length} offices</Badge>
                        <Badge variant="outline">{candidateCount} candidates</Badge>
                        <Badge variant="outline">{eligibleVoterCount} eligible voters</Badge>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button onClick={() => setActiveSection(recommendedStep.section)} type="button">
                          {recommendedStep.actionLabel}
                        </Button>
                        {selectedElectionId ? (
                          <Button onClick={() => setActiveSection("setup")} type="button" variant="outline">
                            Review election status
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    {readinessItems.map((item) => (
                      <ReadinessItem key={item.label} label={item.label} meta={item.meta} tone={item.tone} />
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {workflowCards.map((card) => (
                    <WorkflowCard
                      key={card.section}
                      description={card.description}
                      isActive={activeSection === card.section}
                      isDisabled={card.disabled}
                      label={sectionLabelMap[card.section]}
                      meta={card.meta}
                      onClick={() => setActiveSection(card.section)}
                      tone={card.tone}
                    />
                  ))}
                </div>
              </SectionCard>

              {canManageSelectedOrganization ? (
                <SectionCard
                  title="Organization theme"
                  description="Choose the preset and approved colors for this organization. Changes show up right away."
                >
                  <OrganizationThemeForm
                    value={themeForm}
                    onChange={setThemeForm}
                    onSubmit={() => void handleUpdateTheme()}
                    isSaving={activeAction === "update-theme"}
                  />
                </SectionCard>
              ) : null}

              <Tabs value={activeSection} onValueChange={(value) => setActiveSection(value as WorkspaceSection)}>
                <SectionCard
                  title="Election lifecycle"
                  description={sectionHintMap[activeSection]}
                >
                  <TabsList className="grid w-full gap-2 bg-transparent p-0 md:grid-cols-3 xl:grid-cols-6">
                    {workspaceSections.map((section) => (
                      <TabsTrigger
                        key={section}
                        value={section}
                        disabled={sectionDisabled(section)}
                        className="border border-[color:var(--border)] bg-white data-[state=active]:border-[color:var(--primary)]/30 data-[state=active]:bg-[color:var(--secondary)]/70 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sectionLabelMap[section]}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </SectionCard>

                <TabsContent value="members">
                  {!selectedOrganization ? (
                    <EmptyPanel
                      title="No organization selected"
                      body="Choose an organization first."
                    />
                  ) : !canManageSelectedOrganization ? (
                    <EmptyPanel
                      title="Member access is restricted"
                      body="Only organization managers can add members or change ballot access."
                    />
                  ) : (
                    <div className="space-y-6">
                      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                        <SectionCard
                          title="Invite or add member"
                          description="Add people to this organization and choose their role."
                          action={isLoadingMembers ? <Badge variant="outline">Refreshing...</Badge> : undefined}
                        >
                          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateMember}>
                            <div className="space-y-2">
                              <label className="text-sm font-medium" htmlFor="member-first-name">
                                First name
                              </label>
                              <Input
                                id="member-first-name"
                                required
                                value={memberForm.firstName}
                                onChange={(event) =>
                                  setMemberForm((current) => ({ ...current, firstName: event.target.value }))
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium" htmlFor="member-last-name">
                                Last name
                              </label>
                              <Input
                                id="member-last-name"
                                required
                                value={memberForm.lastName}
                                onChange={(event) =>
                                  setMemberForm((current) => ({ ...current, lastName: event.target.value }))
                                }
                              />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-sm font-medium" htmlFor="member-email">
                                Email
                              </label>
                              <Input
                                id="member-email"
                                required
                                type="email"
                                value={memberForm.email}
                                onChange={(event) =>
                                  setMemberForm((current) => ({ ...current, email: event.target.value }))
                                }
                              />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <label className="text-sm font-medium">Organization role</label>
                              <Select
                                value={memberForm.role}
                                onValueChange={(value) =>
                                  setMemberForm((current) => ({ ...current, role: value }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose a role" />
                                </SelectTrigger>
                                <SelectContent>
                                  {membershipRoles.map((role) => (
                                    <SelectItem key={role} value={role}>
                                      {toTitleCase(role)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              className="md:col-span-2"
                              disabled={activeAction === "create-member"}
                              type="submit"
                            >
                              {activeAction === "create-member" ? "Saving member..." : "Add member"}
                            </Button>
                          </form>
                        </SectionCard>

                        <SectionCard
                          title="Role guide"
                          description="These roles control access and permissions."
                        >
                          <div className="grid gap-3">
                            {[
                              ["Owner", "Full control of the organization, including voting access."],
                              ["Admin", "Can manage elections and members, and can also vote."],
                              ["Voter", "Can vote, but cannot manage organization settings."],
                              ["Member", "Basic membership only. No ballot access."]
                            ].map(([title, body]) => (
                              <div
                                key={title}
                                className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/50 p-4"
                              >
                                <p className="font-semibold">{title}</p>
                                <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{body}</p>
                              </div>
                            ))}
                          </div>
                        </SectionCard>
                      </div>

                      <SectionCard
                        title="Organization roster"
                        description="Everyone currently added to this organization."
                      >
                        {members.length === 0 ? (
                          <SharedEmptyState
                            title="No members yet"
                            body="Only the organization owner has been added so far."
                          />
                        ) : (
                          <div className="grid gap-4">
                            {members.map((member) => (
                              <Card key={member.id} className="border-white/70 bg-white/95">
                                <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="font-semibold">
                                        {member.user.firstName} {member.user.lastName}
                                      </p>
                                      <StatusPill status={member.role} />
                                      <Badge variant="outline">
                                        {member.canVote ? "Eligible voter" : "No ballot access"}
                                      </Badge>
                                      <Badge variant="outline">{toTitleCase(member.user.status)}</Badge>
                                    </div>
                                    <p className="text-sm text-[color:var(--muted-foreground)]">{member.user.email}</p>
                                  </div>
                                  <div className="grid gap-3">
                                    <div className="space-y-2">
                                      <label className="text-sm font-medium">Role</label>
                                      <Select
                                        value={member.role}
                                        onValueChange={(value) => void handleUpdateMemberRole(member.id, value)}
                                        disabled={activeAction === `member-role-${member.id}`}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="Choose a role" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {membershipRoles.map((role) => (
                                            <SelectItem key={role} value={role}>
                                              {toTitleCase(role)}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <p className="text-sm text-[color:var(--muted-foreground)]">
                                      Platform role: <span className="font-medium text-[color:var(--foreground)]">{toTitleCase(member.user.role)}</span>
                                    </p>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </SectionCard>

                      {!selectedElectionId ? (
                        <EmptyPanel
                          title="Choose an election"
                          body="Pick an election in Setup before importing a voter registry or sending invites."
                        />
                      ) : (
                        <>
                          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                            <SectionCard
                              title="Voter registry import"
                              description="Upload a CSV or XLSX file with member_unique_id, full_name, age, and email."
                              action={isLoadingEligibility ? <Badge variant="outline">Refreshing...</Badge> : undefined}
                            >
                              <form className="space-y-4" onSubmit={handlePreviewEligibilityImport}>
                                <div className="space-y-2">
                                  <label className="text-sm font-medium" htmlFor="registry-file">
                                    Registry file
                                  </label>
                                  <Input
                                    key={importInputKey}
                                    id="registry-file"
                                    accept=".csv,.xlsx"
                                    type="file"
                                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                                      setRegistryFile(event.target.files?.[0] ?? null)
                                    }
                                  />
                                  <p className="text-sm text-[color:var(--muted-foreground)]">
                                    {registryFile ? registryFile.name : "Choose a CSV or XLSX file to preview."}
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-3">
                                  <Button
                                    disabled={activeAction === "preview-registry-import" || !registryFile}
                                    type="submit"
                                  >
                                    {activeAction === "preview-registry-import" ? "Previewing..." : "Preview registry"}
                                  </Button>
                                  {importPreview ? (
                                    <Button
                                      disabled={activeAction === "commit-registry-import"}
                                      onClick={() => void handleCommitEligibilityImport()}
                                      type="button"
                                      variant="outline"
                                    >
                                      {activeAction === "commit-registry-import" ? "Committing..." : "Commit accepted rows"}
                                    </Button>
                                  ) : null}
                                </div>
                              </form>

                              {importPreview ? (
                                <div className="space-y-4">
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <MetricCard label="Accepted rows" value={importPreview.summary.acceptedCount} />
                                    <MetricCard label="Rejected rows" value={importPreview.summary.rejectedCount} />
                                  </div>

                                  <div className="grid gap-4 xl:grid-cols-2">
                                    <div className="space-y-3">
                                      <p className="text-sm font-medium">Accepted rows</p>
                                      {importPreview.acceptedRows.length === 0 ? (
                                        <div className="rounded-[calc(var(--radius)-0.25rem)] border border-dashed border-[color:var(--border)] p-4 text-sm text-[color:var(--muted-foreground)]">
                                          No valid rows yet.
                                        </div>
                                      ) : (
                                        importPreview.acceptedRows.slice(0, 8).map((row) => (
                                          <div
                                            key={`accepted-${row.rowNumber}-${row.memberUniqueId}`}
                                            className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-white p-4"
                                          >
                                            <div className="flex flex-wrap items-center gap-2">
                                              <Badge variant="outline">Row {row.rowNumber}</Badge>
                                              <p className="font-semibold">{row.fullName}</p>
                                            </div>
                                            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                                              {row.memberUniqueId} · {row.email} · Age {row.age}
                                            </p>
                                          </div>
                                        ))
                                      )}
                                      {importPreview.acceptedRows.length > 8 ? (
                                        <p className="text-sm text-[color:var(--muted-foreground)]">
                                          Showing the first 8 accepted rows.
                                        </p>
                                      ) : null}
                                    </div>

                                    <div className="space-y-3">
                                      <p className="text-sm font-medium">Rejected rows</p>
                                      {importPreview.rejectedRows.length === 0 ? (
                                        <div className="rounded-[calc(var(--radius)-0.25rem)] border border-dashed border-[color:var(--border)] p-4 text-sm text-[color:var(--muted-foreground)]">
                                          No row errors found.
                                        </div>
                                      ) : (
                                        importPreview.rejectedRows.slice(0, 8).map((row) => (
                                          <div
                                            key={`rejected-${row.rowNumber}`}
                                            className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--warning)]/30 bg-[color:var(--warning)]/10 p-4"
                                          >
                                            <div className="flex flex-wrap items-center gap-2">
                                              <Badge variant="outline">Row {row.rowNumber}</Badge>
                                              <p className="font-semibold">
                                                {row.values.full_name ?? row.values.member_unique_id ?? "Row error"}
                                              </p>
                                            </div>
                                            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">
                                              {row.errors.join(" ")}
                                            </p>
                                          </div>
                                        ))
                                      )}
                                      {importPreview.rejectedRows.length > 8 ? (
                                        <p className="text-sm text-[color:var(--muted-foreground)]">
                                          Showing the first 8 rejected rows.
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </SectionCard>

                            <SectionCard
                              title="Election eligibility"
                              description="Review the voter registry for the selected election and send invite emails."
                              action={
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="outline">{selectedElectionSummary?.title ?? "Election selected"}</Badge>
                                  <Button
                                    disabled={activeAction === "send-election-invites" || !eligibilityRoster}
                                    onClick={() => void handleSendElectionInvites()}
                                    type="button"
                                    variant="outline"
                                  >
                                    {activeAction === "send-election-invites" ? "Sending..." : "Send invites"}
                                  </Button>
                                </div>
                              }
                            >
                              {!eligibilityRoster ? (
                                <SharedEmptyState
                                  title="No voter registry yet"
                                  body="Import and commit a voter registry to start managing election eligibility."
                                />
                              ) : (
                                <div className="space-y-5">
                                  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                                    <MetricCard label="Eligible" value={eligibilityRoster.summary.importedEligibleCount} />
                                    <MetricCard label="Invites sent" value={eligibilityRoster.summary.invitesSentCount} />
                                    <MetricCard label="Claimed" value={eligibilityRoster.summary.claimedCount} />
                                    <MetricCard label="Voted" value={eligibilityRoster.summary.votedCount} />
                                    <MetricCard label="Revoked" value={eligibilityRoster.summary.revokedCount} />
                                    <MetricCard label="Expired" value={eligibilityRoster.summary.expiredCount} />
                                  </div>

                                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div className="space-y-1">
                                      <p className="text-sm font-medium">Filter by status</p>
                                      <p className="text-sm text-[color:var(--muted-foreground)]">
                                        Ballots submitted: {eligibilityRoster.summary.ballotsSubmitted}
                                      </p>
                                    </div>
                                    <Select
                                      value={eligibilityFilter}
                                      onValueChange={(value) => setEligibilityFilter(value as EligibilityFilterValue)}
                                    >
                                      <SelectTrigger className="w-full md:w-56">
                                        <SelectValue placeholder="Filter status" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {eligibilityStatusOptions.map((status) => (
                                          <SelectItem key={status} value={status}>
                                            {status === "ALL" ? "All statuses" : toTitleCase(status)}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {eligibilityRoster.eligibilities.length === 0 ? (
                                    <div className="rounded-[calc(var(--radius)-0.25rem)] border border-dashed border-[color:var(--border)] p-6 text-sm text-[color:var(--muted-foreground)]">
                                      No records match this filter yet.
                                    </div>
                                  ) : (
                                    <div className="grid gap-4">
                                      {eligibilityRoster.eligibilities.map((eligibility) => (
                                        <Card key={eligibility.id} className="border-white/70 bg-white/95">
                                          <CardContent className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
                                            <div className="space-y-2">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-semibold">{eligibility.fullName}</p>
                                                <StatusPill status={eligibility.status} />
                                                <Badge variant="outline">{eligibility.memberUniqueId}</Badge>
                                              </div>
                                              <p className="text-sm text-[color:var(--muted-foreground)]">
                                                {eligibility.email} · Age {eligibility.age}
                                              </p>
                                              <div className="flex flex-wrap gap-2">
                                                {eligibility.importJob ? (
                                                  <Badge variant="outline">
                                                    {eligibility.importJob.filename} · {eligibility.importJob.sourceFormat}
                                                  </Badge>
                                                ) : null}
                                                {eligibility.latestInvite?.sentAt ? (
                                                  <Badge variant="outline">
                                                    Sent {formatDateTime(eligibility.latestInvite.sentAt)}
                                                  </Badge>
                                                ) : (
                                                  <Badge variant="outline">Not sent yet</Badge>
                                                )}
                                                {eligibility.claimedAt ? (
                                                  <Badge variant="outline">Claimed {formatDateTime(eligibility.claimedAt)}</Badge>
                                                ) : null}
                                                {eligibility.votedAt ? (
                                                  <Badge variant="outline">Voted {formatDateTime(eligibility.votedAt)}</Badge>
                                                ) : null}
                                              </div>
                                            </div>
                                            <div className="space-y-3">
                                              <div className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/50 p-4">
                                                <p className="text-sm text-[color:var(--muted-foreground)]">
                                                  {eligibility.latestInvite
                                                    ? eligibility.latestInvite.revokedAt
                                                      ? "Latest invite was revoked."
                                                      : eligibility.latestInvite.usedAt
                                                        ? "Latest invite has been used."
                                                        : `Invite expires ${formatDateTime(eligibility.latestInvite.expiresAt)}.`
                                                    : "No invite has been sent yet."}
                                                </p>
                                              </div>
                                              <div className="flex flex-wrap gap-2">
                                                <Button
                                                  disabled={
                                                    activeAction === `resend-election-invite-${eligibility.id}` ||
                                                    ["CLAIMED", "VOTED", "REVOKED", "EXPIRED"].includes(eligibility.status)
                                                  }
                                                  onClick={() => void handleResendElectionInvite(eligibility.id)}
                                                  type="button"
                                                  variant="outline"
                                                >
                                                  {activeAction === `resend-election-invite-${eligibility.id}` ? "Resending..." : eligibility.latestInvite?.sentAt ? "Resend invite" : "Send invite"}
                                                </Button>
                                              </div>
                                              {eligibility.latestInvite?.revokedAt ? (
                                                <p className="text-sm text-[color:var(--muted-foreground)]">
                                                  Invite revoked {formatDateTime(eligibility.latestInvite.revokedAt)}.
                                                </p>
                                              ) : null}
                                            </div>
                                          </CardContent>
                                        </Card>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </SectionCard>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="setup">
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                    <SectionCard
                      title="Election setup"
                      description="Create elections and choose the one you want to work on."
                      action={isLoadingElections ? <Badge variant="outline">Refreshing...</Badge> : undefined}
                    >
                      <form className="space-y-4" onSubmit={handleCreateElection}>
                        <div className="space-y-2">
                          <label className="text-sm font-medium" htmlFor="election-title">
                            Election title
                          </label>
                          <Input
                            id="election-title"
                            required
                            value={electionForm.title}
                            onChange={(event) =>
                              setElectionForm((current) => ({ ...current, title: event.target.value }))
                            }
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium" htmlFor="election-description">
                            Description
                          </label>
                          <Textarea
                            id="election-description"
                            rows={3}
                            value={electionForm.description}
                            onChange={(event) =>
                              setElectionForm((current) => ({
                                ...current,
                                description: event.target.value
                              }))
                            }
                          />
                        </div>

                        <Button className="w-full" disabled={activeAction === "create-election"} type="submit">
                          {activeAction === "create-election" ? "Creating election..." : "Create election"}
                        </Button>
                      </form>

                      <div className="space-y-3">
                        <p className="text-sm font-medium text-[color:var(--foreground)]">Choose active election</p>
                        {elections.length === 0 ? (
                          <SharedEmptyState title="No elections yet" body="Create the first election above." />
                        ) : (
                          <>
                            <Select
                              value={selectedElectionId ?? undefined}
                              onValueChange={(value) => setSelectedElectionId(value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select an election" />
                              </SelectTrigger>
                              <SelectContent>
                                {elections.map((election) => (
                                  <SelectItem key={election.id} value={election.id}>
                                    {election.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="space-y-3">
                              {elections.map((election) => (
                                <button
                                  key={election.id}
                                  className={`w-full rounded-[calc(var(--radius)-0.25rem)] border p-4 text-left transition ${
                                    election.id === selectedElectionId
                                      ? "border-[color:var(--primary)]/30 bg-[color:var(--secondary)]/65"
                                      : "border-[color:var(--border)] bg-white hover:bg-[color:var(--muted)]/60"
                                  }`}
                                  onClick={() => setSelectedElectionId(election.id)}
                                  type="button"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="font-semibold">{election.title}</p>
                                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                                        {election.description ?? "No description yet."}
                                      </p>
                                    </div>
                                    <StatusPill status={election.status} />
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <Badge variant="outline">{election._count?.offices ?? 0} offices</Badge>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </SectionCard>

                    {!selectedElectionId || !electionDetail ? (
                      <EmptyPanel
                        title="Select an election"
                        body="Choose an election to manage offices, candidates, ballots, and results."
                      />
                    ) : (
                      <SectionCard
                        title={electionDetail.title}
                        description={electionDetail.description ?? "No description yet."}
                        action={<StatusPill status={electionDetail.status} />}
                      >
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/55 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">Start</p>
                            <p className="mt-2 font-semibold">{formatDateTime(electionDetail.startsAt)}</p>
                          </div>
                          <div className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/55 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">End</p>
                            <p className="mt-2 font-semibold">{formatDateTime(electionDetail.endsAt)}</p>
                          </div>
                          <div className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/55 p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">Ballots</p>
                            <p className="mt-2 font-semibold">{electionDetail._count?.ballots ?? 0}</p>
                          </div>
                        </div>

                        {canManageSelectedOrganization ? (
                          <div className="flex flex-wrap gap-2">
                            {electionStatuses.map((status) => (
                              <Button
                                key={status}
                                variant={electionDetail.status === status ? "default" : "outline"}
                                disabled={activeAction === `status-${status}` || isLoadingElectionWorkspace}
                                onClick={() => void handleElectionStatusUpdate(status)}
                                type="button"
                              >
                                {toTitleCase(status)}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <Alert>
                            <AlertTitle>Read-only election status</AlertTitle>
                            <AlertDescription>Only organization managers can change election status.</AlertDescription>
                          </Alert>
                        )}

                        {selectedElectionSummary ? (
                          <div className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-white p-4">
                            <p className="text-sm text-[color:var(--muted-foreground)]">
                              This election currently has {selectedElectionSummary._count?.offices ?? 0} office{selectedElectionSummary._count?.offices === 1 ? "" : "s"} in the workspace.
                            </p>
                          </div>
                        ) : null}
                      </SectionCard>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="structure">
                  {!hasElectionWorkspace || !electionDetail ? (
                    <EmptyPanel
                      title="No election selected"
                      body="Choose an election in Setup to add offices and candidates."
                    />
                  ) : (
                    <div className="space-y-6">
                      {canManageSelectedOrganization ? (
                        <div className="grid gap-6 xl:grid-cols-2">
                          <SectionCard title="Create office" description="Add the offices voters will choose from.">
                            <form className="space-y-4" onSubmit={handleCreateOffice}>
                              <div className="space-y-2">
                                <label className="text-sm font-medium" htmlFor="office-title">
                                  Office title
                                </label>
                                <Input
                                  id="office-title"
                                  required
                                  value={officeForm.title}
                                  onChange={(event) =>
                                    setOfficeForm((current) => ({ ...current, title: event.target.value }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium" htmlFor="office-seats">
                                  Seats
                                </label>
                                <Input
                                  id="office-seats"
                                  min={1}
                                  required
                                  type="number"
                                  value={officeForm.seats}
                                  onChange={(event) =>
                                    setOfficeForm((current) => ({
                                      ...current,
                                      seats: Number(event.target.value)
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium" htmlFor="office-description">
                                  Description
                                </label>
                                <Textarea
                                  id="office-description"
                                  rows={3}
                                  value={officeForm.description}
                                  onChange={(event) =>
                                    setOfficeForm((current) => ({
                                      ...current,
                                      description: event.target.value
                                    }))
                                  }
                                />
                              </div>
                              <Button className="w-full" disabled={activeAction === "create-office"} type="submit">
                                {activeAction === "create-office" ? "Creating office..." : "Add office"}
                              </Button>
                            </form>
                          </SectionCard>

                          <SectionCard title="Create candidate" description="Add a candidate to an office on this ballot.">
                            <form className="space-y-4" onSubmit={handleCreateCandidate}>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Office</label>
                                <Select
                                  value={candidateForm.officeId}
                                  onValueChange={(value) =>
                                    setCandidateForm((current) => ({
                                      ...current,
                                      officeId: value
                                    }))
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Choose an office" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {currentOffices.map((office) => (
                                      <SelectItem key={office.id} value={office.id}>
                                        {office.title}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium" htmlFor="candidate-name">
                                  Candidate name
                                </label>
                                <Input
                                  id="candidate-name"
                                  required
                                  value={candidateForm.displayName}
                                  onChange={(event) =>
                                    setCandidateForm((current) => ({
                                      ...current,
                                      displayName: event.target.value
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium" htmlFor="candidate-bio">
                                  Candidate bio
                                </label>
                                <Textarea
                                  id="candidate-bio"
                                  rows={3}
                                  value={candidateForm.bio}
                                  onChange={(event) =>
                                    setCandidateForm((current) => ({ ...current, bio: event.target.value }))
                                  }
                                />
                              </div>
                              <Button
                                className="w-full"
                                disabled={activeAction === "create-candidate" || currentOffices.length === 0}
                                type="submit"
                              >
                                {activeAction === "create-candidate" ? "Creating candidate..." : "Add candidate"}
                              </Button>
                            </form>
                          </SectionCard>
                        </div>
                      ) : null}

                      <SectionCard
                        title="Offices and candidates"
                        description="This is what voters will see on the ballot."
                        action={isLoadingElectionWorkspace ? <Badge variant="outline">Refreshing...</Badge> : undefined}
                      >
                        {electionDetail.offices.length === 0 ? (
                          <SharedEmptyState
                            title="No offices yet"
                            body="Create the first office to begin building the ballot."
                          />
                        ) : (
                          <div className="grid gap-4 xl:grid-cols-2">
                            {electionDetail.offices.map((office) => (
                              <Card key={office.id} className="border-white/70 bg-white/95">
                                <CardContent className="space-y-4 p-5">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <h3 className="font-[family:var(--font-heading)] text-2xl">{office.title}</h3>
                                      <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                                        {office.description ?? "No description yet."}
                                      </p>
                                    </div>
                                    <Badge variant="outline">
                                      {office.seats} seat{office.seats > 1 ? "s" : ""}
                                    </Badge>
                                  </div>
                                  <div className="grid gap-3">
                                    {office.candidates.length === 0 ? (
                                      <div className="rounded-[calc(var(--radius)-0.25rem)] border border-dashed border-[color:var(--border)] p-4 text-sm text-[color:var(--muted-foreground)]">
                                        No candidates yet.
                                      </div>
                                    ) : (
                                      office.candidates.map((candidate) => (
                                        <div
                                          key={candidate.id}
                                          className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/50 p-4"
                                        >
                                          <p className="font-semibold">{candidate.displayName}</p>
                                          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                                            {candidate.bio ?? "No bio yet."}
                                          </p>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </SectionCard>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="vote">
                  {!hasElectionWorkspace ? (
                    <EmptyPanel
                      title="No ballot available yet"
                      body="Create and select an election before opening voting."
                    />
                  ) : !ballotState ? (
                    <EmptyPanel
                      title="Loading ballot"
                      body="The ballot is still loading for this election."
                    />
                  ) : ballotState.offices.length === 0 ? (
                    <EmptyPanel
                      title="No ballot yet"
                      body="Add offices and candidates before asking members to vote."
                    />
                  ) : (
                    <form className="space-y-6" onSubmit={handleSubmitBallot}>
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
                        <div className="space-y-6">
                          <SectionCard
                            title={ballotState.election.title}
                            description={ballotState.election.description ?? "No description yet."}
                            action={<StatusPill status={ballotState.election.status} />}
                          >
                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/55 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">Starts</p>
                                <p className="mt-2 font-semibold">{formatDateTime(ballotState.election.startsAt)}</p>
                              </div>
                              <div className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/55 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">Ends</p>
                                <p className="mt-2 font-semibold">{formatDateTime(ballotState.election.endsAt)}</p>
                              </div>
                              <div className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/55 p-4">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]">Progress</p>
                                <p className="mt-2 font-semibold">{ballotCompletionPercent}% complete</p>
                              </div>
                            </div>
                            <Progress value={ballotCompletionPercent} />
                          </SectionCard>

                          {ballotState.offices.map((office, index) => (
                            <SectionCard
                              key={office.id}
                              title={office.title}
                              description={office.description ?? "No description yet."}
                              action={<Badge variant="outline">{office.seats} seat{office.seats === 1 ? "" : "s"}</Badge>}
                            >
                              <div className="mb-1">
                                <SharedWorkflowStep
                                  isActive={!ballotSelections[office.id]}
                                  isComplete={Boolean(ballotSelections[office.id])}
                                  label={`Step ${index + 1}`}
                                  meta={ballotSelections[office.id] ? "Selected" : "Choose one candidate"}
                                />
                              </div>
                              <RadioGroup
                                value={ballotSelections[office.id]}
                                onValueChange={(value) =>
                                  setBallotSelections((current) => ({
                                    ...current,
                                    [office.id]: value
                                  }))
                                }
                                className="grid gap-3"
                              >
                                {office.candidates.map((candidate) => {
                                  const isSelected = ballotSelections[office.id] === candidate.id;

                                  return (
                                    <label
                                      key={candidate.id}
                                      className={`flex cursor-pointer items-start gap-4 rounded-[calc(var(--radius)-0.25rem)] border p-4 transition ${
                                        isSelected
                                          ? "border-[color:var(--primary)]/35 bg-[color:var(--secondary)]/60"
                                          : "border-[color:var(--border)] bg-white hover:bg-[color:var(--muted)]/50"
                                      }`}
                                    >
                                      <RadioGroupItem
                                        value={candidate.id}
                                        disabled={Boolean(ballotState.ballot) || !ballotIsOpen}
                                        className="mt-1"
                                      />
                                      <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="font-semibold">{candidate.displayName}</p>
                                          {isSelected ? <Badge variant="outline">Selected</Badge> : null}
                                        </div>
                                        <p className="text-sm text-[color:var(--muted-foreground)]">
                                          {candidate.bio ?? "No bio yet."}
                                        </p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </RadioGroup>
                            </SectionCard>
                          ))}
                        </div>

                        <ReviewPanel
                          title="Review ballot"
                          subtitle={
                            ballotState.ballot
                              ? "This account has already submitted a ballot for this election."
                              : ballotIsOpen
                                ? "Check your choices before you submit."
                                : "Voting is disabled until this election is OPEN."
                          }
                          progress={ballotCompletionPercent}
                          stats={[
                            { label: "Completed", value: `${selectedBallotCount}/${totalBallotOffices}` },
                            { label: "Election state", value: toTitleCase(ballotState.election.status) }
                          ]}
                          items={ballotReviewItems.map((item) => ({
                            label: item.officeTitle,
                            value: item.candidateName ?? "Pending selection"
                          }))}
                          actions={
                            <Button
                              className="w-full"
                              disabled={
                                activeAction === "submit-ballot" ||
                                Boolean(ballotState.ballot) ||
                                !ballotIsOpen
                              }
                              type="submit"
                            >
                              {ballotState.ballot
                                ? "Ballot already submitted"
                                : activeAction === "submit-ballot"
                                  ? "Submitting ballot..."
                                  : "Submit ballot"}
                            </Button>
                          }
                          notes={
                            ballotState.ballot
                              ? "This ballot has already been recorded."
                              : "You can only submit one ballot for this election."
                          }
                        />
                      </div>
                    </form>
                  )}
                </TabsContent>

                <TabsContent value="results">
                  {!hasElectionWorkspace ? (
                    <EmptyPanel
                      title="No results to display"
                      body="Choose an election to view results."
                    />
                  ) : resultsError ? (
                    <Alert>
                      <AlertTitle>Results are unavailable</AlertTitle>
                      <AlertDescription>{resultsError}</AlertDescription>
                    </Alert>
                  ) : !results || results.offices.length === 0 ? (
                    <EmptyPanel title="No results yet" body="No votes have been counted for this election." />
                  ) : (
                    <SectionCard title="Results" description="Vote totals for this election.">
                      <div className="grid gap-4">
                        {results.offices.map((office) => (
                          <Card key={office.officeId} className="border-white/70 bg-white/95">
                            <CardContent className="space-y-5 p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h3 className="font-[family:var(--font-heading)] text-2xl">{office.title}</h3>
                                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                                    {office.totalVotes} total votes counted
                                  </p>
                                </div>
                                <Badge variant="outline">
                                  {office.seats} seat{office.seats > 1 ? "s" : ""}
                                </Badge>
                              </div>

                              <div className="space-y-4">
                                {[...office.candidates]
                                  .sort((left, right) => right.votes - left.votes)
                                  .map((candidate) => {
                                    const percentage =
                                      office.totalVotes === 0
                                        ? 0
                                        : Math.round((candidate.votes / office.totalVotes) * 100);

                                    return (
                                      <div key={candidate.candidateId} className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                          <div>
                                            <p className="font-semibold">{candidate.displayName}</p>
                                            <p className="text-sm text-[color:var(--muted-foreground)]">
                                              {candidate.votes} votes
                                            </p>
                                          </div>
                                          <Badge variant="outline">{percentage}%</Badge>
                                        </div>
                                        <Progress value={percentage || (office.totalVotes ? 8 : 0)} />
                                      </div>
                                    );
                                  })}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </SectionCard>
                  )}
                </TabsContent>

                <TabsContent value="audit">
                  {!selectedOrganization ? (
                    <EmptyPanel
                      title="No organization selected"
                      body="Choose an organization to view its audit log."
                    />
                  ) : !canManageSelectedOrganization ? (
                    <EmptyPanel
                      title="Audit access is restricted"
                      body="Only organization managers can view the audit log."
                    />
                  ) : (
                    <SectionCard
                      title="Audit log"
                      description="Recent actions across the organization. Ballot choices are never stored here."
                      action={isLoadingAuditLogs ? <Badge variant="outline">Refreshing...</Badge> : undefined}
                    >
                      {auditLogs.length === 0 ? (
                        <SharedEmptyState title="No recent activity yet" body="Activity will appear here as people use the app." />
                      ) : (
                        <div className="grid gap-4">
                          {auditLogs.map((log) => (
                            <Card key={log.id} className="border-white/70 bg-white/95">
                              <CardContent className="space-y-4 p-5">
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                  <div className="space-y-1">
                                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--primary)]">
                                      #{log.targetType}
                                    </p>
                                    <h3 className="font-[family:var(--font-heading)] text-2xl">
                                      {formatAuditAction(log.action)}
                                    </h3>
                                  </div>
                                  <Badge variant="outline">{formatDateTime(log.createdAt)}</Badge>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <Badge variant="outline">
                                    Actor: {log.actor.firstName} {log.actor.lastName}
                                  </Badge>
                                  <Badge variant="outline">{log.actor.email}</Badge>
                                  <Badge variant="outline">Role: {toTitleCase(log.actor.role)}</Badge>
                                  {log.ipAddress ? <Badge variant="outline">IP: {log.ipAddress}</Badge> : null}
                                </div>

                                <p className="text-sm text-[color:var(--muted-foreground)]">
                                  {formatAuditMetadata(log.metadata)}
                                </p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </SectionCard>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
