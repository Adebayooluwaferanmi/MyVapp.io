import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  createOrganizationMember,
  createCandidate,
  createElection,
  createOffice,
  createOrganization,
  getElectionBallot,
  getElectionDetail,
  getElectionResults,
  listElections,
  listOrganizationMembers,
  listOrganizations,
  submitBallot,
  updateOrganizationMemberRole,
  updateElectionStatus
} from "../lib/services";
import type {
  BallotState,
  ElectionDetail,
  ElectionSummary,
  OrganizationMember,
  Organization,
  Results,
  StoredSession
} from "../types";

type WorkspaceProps = {
  healthMessage: string;
  onLogout: () => void;
  onRefreshProfile: () => Promise<void>;
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
const workspaceSections = ["members", "setup", "structure", "vote", "results"] as const;

type WorkspaceSection = (typeof workspaceSections)[number];

const sectionLabelMap: Record<WorkspaceSection, string> = {
  members: "Members",
  setup: "Setup",
  structure: "Structure",
  vote: "Vote",
  results: "Results"
};

const sectionHintMap: Record<WorkspaceSection, string> = {
  members: "Invite members, assign organization roles, and manage voter eligibility.",
  setup: "Create and select elections, then set status windows.",
  structure: "Define offices and candidate lists for the selected election.",
  vote: "Cast ballots with one candidate choice per office.",
  results: "Review manager-facing tally and vote distribution."
};

const initialOrganizationForm = {
  name: "",
  description: ""
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

function StatusPill({ status }: { status: string }) {
  return <span className={`status-badge status-badge--${status.toLowerCase()}`}>{toTitleCase(status)}</span>;
}

function EmptyPanel({
  body,
  title
}: {
  body: string;
  title: string;
}) {
  return (
    <section className="panel empty-panel">
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </section>
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
    <article className="panel metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
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
      className={isActive ? `workflow-card workflow-card--${tone} active` : `workflow-card workflow-card--${tone}`}
      disabled={isDisabled}
      onClick={onClick}
      type="button"
    >
      <span className="workflow-card__eyebrow">{label}</span>
      <strong>{meta}</strong>
      <p>{description}</p>
    </button>
  );
}

export function Workspace({ healthMessage, onLogout, onRefreshProfile, session }: WorkspaceProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
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
  const [ballotSelections, setBallotSelections] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("setup");
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

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
          ? "Add admins and eligible voters before expecting ballot access."
          : "Choose an organization before managing membership and voter eligibility.",
        disabled: !selectedOrganization
      },
      {
        section: "setup" as const,
        tone: selectedElectionId ? "ready" : "attention",
        meta: selectedElectionLabel,
        description: selectedElectionId
          ? `Status is ${toTitleCase(electionDetail?.status ?? "draft")}. Manage timing and publication here.`
          : "Create or select an election before configuring the rest of the workflow.",
        disabled: false
      },
      {
        section: "structure" as const,
        tone: currentOffices.length > 0 ? "ready" : selectedElectionId ? "attention" : "locked",
        meta: `${currentOffices.length} offices · ${candidateCount} candidates`,
        description: selectedElectionId
          ? "Define the ballot structure by adding offices and candidate lists."
          : "Choose an election first to unlock office and candidate setup.",
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
          ? "Voters can choose one candidate per office and submit their ballot."
          : "Add offices and candidates, then open the election to enable voting.",
        disabled: !selectedElectionId
      },
      {
        section: "results" as const,
        tone: hasResults ? "ready" : selectedElectionId ? "attention" : "locked",
        meta: hasResults ? `${results?.offices.length ?? 0} office tallies available` : "Awaiting counted votes",
        description: canManageSelectedOrganization
          ? "Managers can inspect live or historical tallies for the selected election."
          : "Results are reserved for managers in the selected organization.",
        disabled: !selectedElectionId
      }
    ];
  }, [
    candidateCount,
    canManageSelectedOrganization,
    currentOffices.length,
    electionDetail?.status,
    electionDetail?.title,
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
        title: "Start by choosing an organization",
        body: "Create a new organization or select an existing one so the election workspace can load."
      };
    }

    if (!selectedElectionId) {
      return {
        title: "Create or select an election",
        body: "Your next action is to define the election container before you can build a ballot."
      };
    }

    const eligibleVoterCount = members.filter((member) => member.canVote).length;

    if (eligibleVoterCount === 0) {
      return {
        title: "Assign at least one eligible voter",
        body: "Members with the VOTER, ADMIN, or OWNER role can access ballots. Add or update members first."
      };
    }

    if (currentOffices.length === 0) {
      return {
        title: "Add offices to shape the ballot",
        body: "Define the positions being contested so candidate entry and voting have a structure."
      };
    }

    if (candidateCount === 0) {
      return {
        title: "Add candidates to each office",
        body: "The election structure exists, but voters still need candidate options before voting can open."
      };
    }

    if (electionDetail?.status !== "OPEN") {
      return {
        title: "Open the election when the ballot is ready",
        body: "Move the election to OPEN in Setup so members can cast ballots."
      };
    }

    if (!hasSubmittedBallot) {
      return {
        title: "Voting is live",
        body: "Switch to Vote to test the ballot experience or ask members to cast ballots."
      };
    }

    return {
      title: "Review progress and results",
      body: "The core workflow is active. Use Results to monitor vote distribution and confirm tally health."
    };
  }, [
    candidateCount,
    currentOffices.length,
    electionDetail?.status,
    hasSubmittedBallot,
    members,
    selectedElectionId,
    selectedOrganization
  ]);

  useEffect(() => {
    void loadOrganizations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      setMembers([]);
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
    } else {
      setMembers([]);
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
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to submit ballot."
      });
    } finally {
      setActiveAction(null);
    }
  }

  const hasElectionWorkspace = Boolean(selectedElectionId && electionDetail);

  return (
    <section className="dashboard-shell">
      <header className="panel dashboard-header">
        <div>
          <p className="eyebrow">Election command center</p>
          <h1>{session.user.firstName}, your workspace is ready.</h1>
          <p className="lead dashboard-lead">
            Create organizations, configure elections, open voting windows, submit ballots, and inspect result tallies from one place.
          </p>
          <div className="status-strip">
            <span>{healthMessage}</span>
            <span>Signed in as {toTitleCase(session.user.role)}</span>
            {membershipRole ? <span>Organization role: {toTitleCase(membershipRole)}</span> : null}
          </div>
        </div>

        <div className="dashboard-actions">
          <button className="secondary-button" onClick={() => void onRefreshProfile()} type="button">
            Refresh profile
          </button>
          <button className="primary-button" onClick={onLogout} type="button">
            Logout
          </button>
        </div>
      </header>

      <section className="metrics-grid">
        <MetricCard label="Organizations" value={metrics.organizations} />
        <MetricCard label="Elections" value={metrics.elections} />
        <MetricCard label="Offices" value={metrics.offices} />
        <MetricCard label="Candidates" value={metrics.candidates} />
        <MetricCard label="Counted votes" value={metrics.ballots} />
      </section>

      <section className="panel workspace-section-nav">
        <p className="workspace-section-nav__label">Workspace sections</p>
        <p className="workspace-section-nav__hint">{sectionHintMap[activeSection]}</p>
        <div className="workspace-section-buttons">
          {workspaceSections.map((section) => {
            const isActive = section === activeSection;
            const isDisabled = section !== "setup" && !hasElectionWorkspace;

            return (
              <button
                key={section}
                className={isActive ? "workspace-section-button active" : "workspace-section-button"}
                disabled={isDisabled}
                onClick={() => setActiveSection(section)}
                type="button"
              >
                {sectionLabelMap[section]}
              </button>
            );
          })}
        </div>
      </section>

      {notice ? <div className={`notice notice--${notice.tone}`}>{notice.text}</div> : null}

      <section className="dashboard-grid">
        <aside className="dashboard-sidebar">
          <section className="panel session-panel">
            <h2>Session</h2>
            <p>
              <strong>{session.user.firstName} {session.user.lastName}</strong>
            </p>
            <p>{session.user.email}</p>
            <p className="muted">Platform role: {toTitleCase(session.user.role)}</p>
          </section>

          <section className="panel create-panel">
            <h2>Create organization</h2>
            <form className="stack-form" onSubmit={handleCreateOrganization}>
              <label>
                Organization name
                <input
                  required
                  value={organizationForm.name}
                  onChange={(event) =>
                    setOrganizationForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                Description
                <textarea
                  rows={3}
                  value={organizationForm.description}
                  onChange={(event) =>
                    setOrganizationForm((current) => ({
                      ...current,
                      description: event.target.value
                    }))
                  }
                />
              </label>
              <button
                className="primary-button"
                disabled={activeAction === "create-organization"}
                type="submit"
              >
                {activeAction === "create-organization" ? "Creating..." : "Create organization"}
              </button>
            </form>
          </section>

          <section className="panel organization-panel">
            <div className="panel-header">
              <h2>Organizations</h2>
              {isLoadingOrganizations ? <span className="muted">Loading...</span> : null}
            </div>

            {organizations.length === 0 ? (
              <p className="muted">Create your first organization to unlock the election workspace.</p>
            ) : (
              <div className="selector-list">
                {organizations.map((organization) => {
                  const isSelected = organization.id === selectedOrganizationId;

                  return (
                    <button
                      key={organization.id}
                      className={isSelected ? "selector-card active" : "selector-card"}
                      onClick={() => setSelectedOrganizationId(organization.id)}
                      type="button"
                    >
                      <div>
                        <strong>{organization.name}</strong>
                        <p>{organization.description ?? "No description yet."}</p>
                      </div>
                      <div className="selector-meta">
                        <span>{organization._count?.elections ?? 0} elections</span>
                        <span>{organization._count?.members ?? 1} members</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </aside>

        <div className="dashboard-main">
          {!selectedOrganization ? (
            <EmptyPanel
              title="No organization selected"
              body="Create an organization from the sidebar or select one to begin configuring elections."
            />
          ) : (
            <>
              <section className="panel workspace-header-panel">
                <div>
                  <p className="eyebrow">Selected organization</p>
                  <h2>{selectedOrganization.name}</h2>
                  <p className="muted">
                    {selectedOrganization.description ?? "Add elections, offices, and candidates for this organization."}
                  </p>
                </div>
                <div className="workspace-meta">
                  <span>{selectedOrganization._count?.elections ?? elections.length} elections</span>
                  <span>{selectedOrganization._count?.members ?? 1} members</span>
                  {membershipRole ? <StatusPill status={membershipRole} /> : null}
                </div>
              </section>

              <section className="workspace-story-grid">
                <article className="panel workflow-spotlight">
                  <p className="eyebrow">Recommended next step</p>
                  <h3>{recommendedStep.title}</h3>
                  <p className="muted">{recommendedStep.body}</p>
                  <div className="workflow-spotlight__chips">
                    {selectedElectionId ? (
                      <span>
                        Election: <strong>{electionDetail?.title ?? "Loading election..."}</strong>
                      </span>
                    ) : (
                      <span>No election selected yet</span>
                    )}
                    <span>{currentOffices.length} offices configured</span>
                    <span>{candidateCount} candidates loaded</span>
                  </div>
                </article>

                <article className="panel election-snapshot">
                  <p className="eyebrow">Election snapshot</p>
                  <div className="election-snapshot__grid">
                    <div>
                      <span className="detail-label">Current status</span>
                      <strong>{electionDetail ? toTitleCase(electionDetail.status) : "No election selected"}</strong>
                    </div>
                    <div>
                      <span className="detail-label">Voting state</span>
                      <strong>
                        {hasSubmittedBallot
                          ? "Your ballot is in"
                          : electionDetail?.status === "OPEN"
                            ? "Accepting ballots"
                            : "Not accepting ballots"}
                      </strong>
                    </div>
                    <div>
                      <span className="detail-label">Results</span>
                      <strong>{hasResults ? "Tallies available" : "No tallies yet"}</strong>
                    </div>
                  </div>
                </article>
              </section>

              <section className="workflow-grid" aria-label="Workflow stages">
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
              </section>

              {activeSection === "members" ? (
                selectedOrganization ? (
                  canManageSelectedOrganization ? (
                    <section className="panel member-management-panel">
                      <div className="panel-header">
                        <div>
                          <p className="eyebrow">Organization members</p>
                          <h2>Invite people and control voter eligibility</h2>
                        </div>
                        {isLoadingMembers ? <span className="muted">Refreshing...</span> : null}
                      </div>

                      <div className="form-grid">
                        <form className="stack-form compact-form" onSubmit={handleCreateMember}>
                          <h3>Add or invite member</h3>
                          <label>
                            First name
                            <input
                              required
                              value={memberForm.firstName}
                              onChange={(event) =>
                                setMemberForm((current) => ({ ...current, firstName: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            Last name
                            <input
                              required
                              value={memberForm.lastName}
                              onChange={(event) =>
                                setMemberForm((current) => ({ ...current, lastName: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            Email
                            <input
                              required
                              type="email"
                              value={memberForm.email}
                              onChange={(event) =>
                                setMemberForm((current) => ({ ...current, email: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            Organization role
                            <select
                              value={memberForm.role}
                              onChange={(event) =>
                                setMemberForm((current) => ({ ...current, role: event.target.value }))
                              }
                            >
                              {membershipRoles.map((role) => (
                                <option key={role} value={role}>
                                  {toTitleCase(role)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="primary-button"
                            disabled={activeAction === "create-member"}
                            type="submit"
                          >
                            {activeAction === "create-member" ? "Saving..." : "Add member"}
                          </button>
                        </form>

                        <section className="panel member-role-guide">
                          <h3>Role guide</h3>
                          <div className="member-role-guide__list">
                            <div>
                              <strong>Owner</strong>
                              <p>Full organization control, counted as manager, and eligible to vote.</p>
                            </div>
                            <div>
                              <strong>Admin</strong>
                              <p>Can manage elections and members, and is also eligible to vote.</p>
                            </div>
                            <div>
                              <strong>Voter</strong>
                              <p>Can access ballots but cannot manage organization settings.</p>
                            </div>
                            <div>
                              <strong>Member</strong>
                              <p>Basic membership only. This role cannot access ballots.</p>
                            </div>
                          </div>
                        </section>
                      </div>

                      {members.length === 0 ? (
                        <p className="muted">No members yet beyond the initial organization owner.</p>
                      ) : (
                        <div className="member-list">
                          {members.map((member) => (
                            <article className="member-card" key={member.id}>
                              <div className="member-card__identity">
                                <div>
                                  <strong>
                                    {member.user.firstName} {member.user.lastName}
                                  </strong>
                                  <p>{member.user.email}</p>
                                </div>
                                <div className="selector-meta">
                                  <StatusPill status={member.role} />
                                  <span>{member.canVote ? "Eligible voter" : "No ballot access"}</span>
                                  <span>{toTitleCase(member.user.status)}</span>
                                </div>
                              </div>

                              <div className="member-card__controls">
                                <label>
                                  Role
                                  <select
                                    disabled={activeAction === `member-role-${member.id}`}
                                    value={member.role}
                                    onChange={(event) => void handleUpdateMemberRole(member.id, event.target.value)}
                                  >
                                    {membershipRoles.map((role) => (
                                      <option key={role} value={role}>
                                        {toTitleCase(role)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <div className="member-card__summary">
                                  <span className="detail-label">Platform role</span>
                                  <strong>{toTitleCase(member.user.role)}</strong>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </section>
                  ) : (
                    <EmptyPanel
                      title="Member management is restricted"
                      body="Only organization managers can invite members or adjust who is eligible to vote."
                    />
                  )
                ) : (
                  <EmptyPanel
                    title="No organization selected"
                    body="Choose an organization first so you can manage members and voter eligibility."
                  />
                )
              ) : null}

              {activeSection === "setup" ? (
                <div className="workspace-grid">
                  <section className="panel">
                    <div className="panel-header">
                      <h2>Elections</h2>
                      {isLoadingElections ? <span className="muted">Refreshing...</span> : null}
                    </div>

                    <form className="stack-form compact-form" onSubmit={handleCreateElection}>
                      <label>
                        Election title
                        <input
                          required
                          value={electionForm.title}
                          onChange={(event) =>
                            setElectionForm((current) => ({ ...current, title: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        Description
                        <textarea
                          rows={3}
                          value={electionForm.description}
                          onChange={(event) =>
                            setElectionForm((current) => ({
                              ...current,
                              description: event.target.value
                            }))
                          }
                        />
                      </label>
                      <button
                        className="primary-button"
                        disabled={activeAction === "create-election"}
                        type="submit"
                      >
                        {activeAction === "create-election" ? "Creating..." : "Create election"}
                      </button>
                    </form>

                    {elections.length === 0 ? (
                      <p className="muted">No elections yet. Create the first one above.</p>
                    ) : (
                      <div className="selector-list">
                        {elections.map((election) => (
                          <button
                            key={election.id}
                            className={election.id === selectedElectionId ? "selector-card active" : "selector-card"}
                            onClick={() => setSelectedElectionId(election.id)}
                            type="button"
                          >
                            <div>
                              <strong>{election.title}</strong>
                              <p>{election.description ?? "No description yet."}</p>
                            </div>
                            <div className="selector-meta">
                              <StatusPill status={election.status} />
                              <span>{election._count?.offices ?? 0} offices</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

                  {!selectedElectionId || !electionDetail ? (
                    <EmptyPanel
                      title="Select an election"
                      body="Choose an election from the list to manage offices, candidates, ballots, and results."
                    />
                  ) : (
                    <section className="panel">
                      <div className="panel-header">
                        <div>
                          <p className="eyebrow">Election detail</p>
                          <h2>{electionDetail.title}</h2>
                        </div>
                        <StatusPill status={electionDetail.status} />
                      </div>

                      <p className="muted">
                        {electionDetail.description ?? "No election description has been provided yet."}
                      </p>

                      <div className="detail-grid">
                        <div>
                          <span className="detail-label">Start</span>
                          <strong>{formatDateTime(electionDetail.startsAt)}</strong>
                        </div>
                        <div>
                          <span className="detail-label">End</span>
                          <strong>{formatDateTime(electionDetail.endsAt)}</strong>
                        </div>
                        <div>
                          <span className="detail-label">Ballots</span>
                          <strong>{electionDetail._count?.ballots ?? 0}</strong>
                        </div>
                      </div>

                      {canManageSelectedOrganization ? (
                        <div className="status-button-row">
                          {electionStatuses.map((status) => (
                            <button
                              key={status}
                              className={electionDetail.status === status ? "status-button active" : "status-button"}
                              disabled={activeAction === `status-${status}` || isLoadingElectionWorkspace}
                              onClick={() => void handleElectionStatusUpdate(status)}
                              type="button"
                            >
                              {toTitleCase(status)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="muted">Only organization managers can change election status.</p>
                      )}
                    </section>
                  )}
                </div>
              ) : null}

              {activeSection === "structure" ? (
                hasElectionWorkspace && electionDetail ? (
                  <section className="panel">
                    <div className="panel-header">
                      <h2>Offices and candidates</h2>
                      {isLoadingElectionWorkspace ? <span className="muted">Refreshing...</span> : null}
                    </div>

                    {canManageSelectedOrganization ? (
                      <div className="form-grid">
                        <form className="stack-form compact-form" onSubmit={handleCreateOffice}>
                          <h3>Create office</h3>
                          <label>
                            Office title
                            <input
                              required
                              value={officeForm.title}
                              onChange={(event) =>
                                setOfficeForm((current) => ({ ...current, title: event.target.value }))
                              }
                            />
                          </label>
                          <label>
                            Seats
                            <input
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
                          </label>
                          <label>
                            Description
                            <textarea
                              rows={3}
                              value={officeForm.description}
                              onChange={(event) =>
                                setOfficeForm((current) => ({
                                  ...current,
                                  description: event.target.value
                                }))
                              }
                            />
                          </label>
                          <button
                            className="primary-button"
                            disabled={activeAction === "create-office"}
                            type="submit"
                          >
                            {activeAction === "create-office" ? "Creating..." : "Add office"}
                          </button>
                        </form>

                        <form className="stack-form compact-form" onSubmit={handleCreateCandidate}>
                          <h3>Create candidate</h3>
                          <label>
                            Office
                            <select
                              required
                              value={candidateForm.officeId}
                              onChange={(event) =>
                                setCandidateForm((current) => ({
                                  ...current,
                                  officeId: event.target.value
                                }))
                              }
                            >
                              {currentOffices.map((office) => (
                                <option key={office.id} value={office.id}>
                                  {office.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Candidate name
                            <input
                              required
                              value={candidateForm.displayName}
                              onChange={(event) =>
                                setCandidateForm((current) => ({
                                  ...current,
                                  displayName: event.target.value
                                }))
                              }
                            />
                          </label>
                          <label>
                            Candidate bio
                            <textarea
                              rows={3}
                              value={candidateForm.bio}
                              onChange={(event) =>
                                setCandidateForm((current) => ({ ...current, bio: event.target.value }))
                              }
                            />
                          </label>
                          <button
                            className="primary-button"
                            disabled={activeAction === "create-candidate" || currentOffices.length === 0}
                            type="submit"
                          >
                            {activeAction === "create-candidate" ? "Creating..." : "Add candidate"}
                          </button>
                        </form>
                      </div>
                    ) : null}

                    {electionDetail.offices.length === 0 ? (
                      <p className="muted">No offices yet. Create the first office to begin building the ballot.</p>
                    ) : (
                      <div className="office-grid">
                        {electionDetail.offices.map((office) => (
                          <article className="office-card" key={office.id}>
                            <div className="office-card__header">
                              <div>
                                <h3>{office.title}</h3>
                                <p>{office.description ?? "No office description yet."}</p>
                              </div>
                              <span className="seat-count">{office.seats} seat{office.seats > 1 ? "s" : ""}</span>
                            </div>
                            <div className="candidate-stack">
                              {office.candidates.length === 0 ? (
                                <p className="muted">No candidates yet.</p>
                              ) : (
                                office.candidates.map((candidate) => (
                                  <div className="candidate-item" key={candidate.id}>
                                    <strong>{candidate.displayName}</strong>
                                    <p>{candidate.bio ?? "No bio supplied."}</p>
                                  </div>
                                ))
                              )}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                ) : (
                  <EmptyPanel
                    title="Election structure is empty"
                    body="Select an election in Setup to create offices and candidates."
                  />
                )
              ) : null}

              {activeSection === "vote" ? (
                hasElectionWorkspace ? (
                  <section className="panel ballot-panel">
                    <div className="panel-header">
                      <div>
                        <h2>Ballot</h2>
                        <p className="muted">
                          {ballotState?.ballot
                            ? "This account has already submitted a ballot."
                            : "Select one candidate per office and submit when ready."}
                        </p>
                      </div>
                      {ballotState ? <StatusPill status={ballotState.election.status} /> : null}
                    </div>

                    {!ballotState ? (
                      <p className="muted">Select an election to load the ballot.</p>
                    ) : ballotState.offices.length === 0 ? (
                      <p className="muted">This election has no offices yet, so there is no ballot to cast.</p>
                    ) : (
                      <form className="stack-form" onSubmit={handleSubmitBallot}>
                        {ballotState.offices.map((office) => (
                          <label key={office.id}>
                            {office.title}
                            <select
                              disabled={Boolean(ballotState.ballot) || ballotState.election.status !== "OPEN"}
                              value={ballotSelections[office.id] ?? ""}
                              onChange={(event) =>
                                setBallotSelections((current) => ({
                                  ...current,
                                  [office.id]: event.target.value
                                }))
                              }
                            >
                              <option value="">Choose a candidate</option>
                              {office.candidates.map((candidate) => (
                                <option key={candidate.id} value={candidate.id}>
                                  {candidate.displayName}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}

                        <button
                          className="primary-button"
                          disabled={
                            activeAction === "submit-ballot" ||
                            Boolean(ballotState.ballot) ||
                            ballotState.election.status !== "OPEN"
                          }
                          type="submit"
                        >
                          {ballotState.ballot
                            ? "Ballot already submitted"
                            : activeAction === "submit-ballot"
                              ? "Submitting..."
                              : "Submit ballot"}
                        </button>
                      </form>
                    )}
                  </section>
                ) : (
                  <EmptyPanel
                    title="No ballot available yet"
                    body="Create and select an election in Setup before opening voting."
                  />
                )
              ) : null}

              {activeSection === "results" ? (
                hasElectionWorkspace ? (
                  <section className="panel results-panel">
                    <div className="panel-header">
                      <div>
                        <h2>Results</h2>
                        <p className="muted">Manager-facing tally for the selected election.</p>
                      </div>
                    </div>

                    {resultsError ? (
                      <p className="muted">{resultsError}</p>
                    ) : !results || results.offices.length === 0 ? (
                      <p className="muted">No counted results yet.</p>
                    ) : (
                      <div className="results-stack">
                        {results.offices.map((office) => (
                          <article className="result-card" key={office.officeId}>
                            <div className="result-card__header">
                              <div>
                                <h3>{office.title}</h3>
                                <p>{office.totalVotes} total votes counted</p>
                              </div>
                              <span className="seat-count">{office.seats} seat{office.seats > 1 ? "s" : ""}</span>
                            </div>
                            <div className="result-candidates">
                              {[...office.candidates]
                                .sort((left, right) => right.votes - left.votes)
                                .map((candidate) => {
                                  const percentage =
                                    office.totalVotes === 0
                                      ? 0
                                      : Math.round((candidate.votes / office.totalVotes) * 100);

                                  return (
                                    <div className="result-row" key={candidate.candidateId}>
                                      <div className="result-row__copy">
                                        <strong>{candidate.displayName}</strong>
                                        <span>{candidate.votes} votes</span>
                                      </div>
                                      <div className="result-bar">
                                        <div
                                          className="result-bar__fill"
                                          style={{ width: `${Math.max(percentage, office.totalVotes ? 8 : 0)}%` }}
                                        />
                                      </div>
                                      <span className="result-percentage">{percentage}%</span>
                                    </div>
                                  );
                                })}
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                ) : (
                  <EmptyPanel
                    title="No results to display"
                    body="Select an election in Setup to review vote counts and candidate standings."
                  />
                )
              ) : null}
            </>
          )}
        </div>
      </section>
    </section>
  );
}
