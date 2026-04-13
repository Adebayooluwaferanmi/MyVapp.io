import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  EmptyState,
  MetricCard,
  PageHeader,
  PageShell,
  ReviewPanel,
  SectionCard,
  StatusBadge,
  WorkflowStep
} from "@/components/shared/surfaces";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getElectionBallot, listElections, listOrganizations, submitBallot } from "@/lib/services";
import type { OrganizationThemeInput } from "@/lib/theme";
import type { BallotState, ElectionSummary, Organization, StoredSession } from "@/types";

type VoterPortalProps = {
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

type PortalSectionId = "portal-access" | "portal-elections" | "portal-ballot" | "portal-review";

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function PortalNavCard({
  active = false,
  description,
  label,
  onClick
}: {
  active?: boolean;
  description: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-[var(--radius)] border p-4 text-left transition ${
        active
          ? "border-[color:var(--primary)]/35 bg-[color:var(--secondary)]/70"
          : "border-[color:var(--border)] bg-white hover:bg-[color:var(--muted)]/60"
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{label}</p>
        {active ? <Badge variant="outline">Current</Badge> : null}
      </div>
      <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">{description}</p>
    </button>
  );
}

export function VoterPortal({
  healthMessage,
  onLogout,
  onRefreshProfile,
  onThemeChange,
  session
}: VoterPortalProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [elections, setElections] = useState<ElectionSummary[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState<string | null>(null);
  const [ballotState, setBallotState] = useState<BallotState | null>(null);
  const [ballotSelections, setBallotSelections] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [isLoadingOrganizations, setIsLoadingOrganizations] = useState(true);
  const [isLoadingElections, setIsLoadingElections] = useState(false);
  const [isLoadingBallot, setIsLoadingBallot] = useState(false);

  const selectedOrganization = useMemo(
    () => organizations.find((organization) => organization.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId]
  );

  const selectedElection = useMemo(
    () => elections.find((election) => election.id === selectedElectionId) ?? null,
    [elections, selectedElectionId]
  );

  const openElections = useMemo(() => elections.filter((election) => election.status === "OPEN"), [elections]);
  const completedElections = useMemo(() => elections.filter((election) => election.status !== "OPEN"), [elections]);
  const totalOffices = ballotState?.offices.length ?? 0;
  const selectedCount = Object.values(ballotSelections).filter(Boolean).length;
  const completionPercent = totalOffices === 0 ? 0 : Math.round((selectedCount / totalOffices) * 100);
  const hasSubmittedBallot = Boolean(ballotState?.ballot);
  const ballotIsOpen = ballotState?.election.status === "OPEN";

  const reviewItems = useMemo(() => {
    if (!ballotState) {
      return [];
    }

    return ballotState.offices.map((office) => {
      const selectedCandidateId = ballotSelections[office.id];
      const selectedCandidate = office.candidates.find((candidate) => candidate.id === selectedCandidateId);

      return {
        label: office.title,
        value: selectedCandidate?.displayName ?? "Pending selection"
      };
    });
  }, [ballotSelections, ballotState]);

  useEffect(() => {
    void loadOrganizations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      setElections([]);
      setSelectedElectionId(null);
      setBallotState(null);
      return;
    }

    void loadElections(selectedOrganizationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrganizationId, session.token]);

  useEffect(() => {
    if (!selectedOrganizationId || !selectedElectionId) {
      setBallotState(null);
      return;
    }

    void loadBallot(selectedOrganizationId, selectedElectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElectionId, selectedOrganizationId, session.token]);

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
    onThemeChange(
      selectedOrganization
        ? {
            themePreset: selectedOrganization.themePreset,
            themeOverrides: selectedOrganization.themeOverrides ?? undefined
          }
        : { themePreset: "myvapp-default" }
    );
  }, [onThemeChange, selectedOrganization]);

  async function loadOrganizations(preferredOrganizationId?: string) {
    setIsLoadingOrganizations(true);

    try {
      const response = await listOrganizations(session.token);

      setOrganizations(response.organizations);
      setSelectedOrganizationId((current) => {
        if (
          preferredOrganizationId &&
          response.organizations.some((organization) => organization.id === preferredOrganizationId)
        ) {
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
        text: error instanceof Error ? error.message : "Unable to load your organizations."
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

        const firstOpenElection = response.elections.find((election) => election.status === "OPEN");
        return firstOpenElection?.id ?? response.elections[0]?.id ?? null;
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

  async function loadBallot(organizationId: string, electionId: string) {
    setIsLoadingBallot(true);

    try {
      const nextBallotState = await getElectionBallot(session.token, organizationId, electionId);
      setBallotState(nextBallotState);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to load the ballot."
      });
      setBallotState(null);
    } finally {
      setIsLoadingBallot(false);
    }
  }

  async function handleSubmitBallot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedOrganizationId || !selectedElectionId || !ballotState) {
      return;
    }

    const selections = ballotState.offices
      .map((office) => {
        const candidateId = ballotSelections[office.id];

        if (!candidateId) {
          return null;
        }

        return {
          officeId: office.id,
          candidateId
        };
      })
      .filter((selection): selection is { officeId: string; candidateId: string } => selection !== null);

    if (selections.length !== ballotState.offices.length) {
      setNotice({
        tone: "error",
        text: "Review each office before submitting your ballot."
      });
      return;
    }

    setActiveAction("submit-ballot");
    setNotice(null);

    try {
      await submitBallot(session.token, selectedOrganizationId, selectedElectionId, selections);
      await loadBallot(selectedOrganizationId, selectedElectionId);
      setNotice({
        tone: "success",
        text: "Your ballot was submitted successfully."
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to submit your ballot."
      });
    } finally {
      setActiveAction(null);
    }
  }

  function scrollToPortalSection(sectionId: PortalSectionId) {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Voter portal"
        title="Review your ballot and submit when you're ready."
        description="Choose an organization, open an election, and pick one candidate for each office."
        actions={
          <>
            <Button variant="secondary" onClick={() => void onRefreshProfile()} type="button">
              Refresh profile
            </Button>
            <Button onClick={onLogout} type="button">
              Logout
            </Button>
          </>
        }
        meta={
          <>
            <Badge variant="outline">{healthMessage}</Badge>
            <Badge variant="outline">{openElections.length} open election{openElections.length === 1 ? "" : "s"}</Badge>
            <Badge variant={hasSubmittedBallot ? "success" : "outline"}>
              {hasSubmittedBallot ? "Submission recorded" : "Submission pending"}
            </Badge>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <WorkflowStep
          isActive={!selectedOrganization}
          isComplete={Boolean(selectedOrganization)}
          label="Step 1"
          meta={selectedOrganization ? selectedOrganization.name : "Choose organization"}
        />
        <WorkflowStep
          isActive={Boolean(selectedOrganization) && !selectedElection}
          isComplete={Boolean(selectedElection)}
          label="Step 2"
          meta={selectedElection ? selectedElection.title : "Open election"}
        />
        <WorkflowStep
          isActive={Boolean(selectedElection) && !hasSubmittedBallot}
          isComplete={selectedCount > 0 || hasSubmittedBallot}
          label="Step 3"
          meta={`${selectedCount}/${totalOffices} offices reviewed`}
        />
        <WorkflowStep
          isActive={Boolean(selectedElection) && !hasSubmittedBallot}
          isComplete={hasSubmittedBallot}
          label="Step 4"
          meta={hasSubmittedBallot ? "Ballot submitted" : "Confirm and submit"}
        />
      </div>

      {notice ? (
        <Alert variant={notice.tone === "error" ? "destructive" : "success"}>
          <AlertTitle>{notice.tone === "error" ? "Please check this" : "Done"}</AlertTitle>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}

      <SectionCard
        title="Portal navigation"
        description="Move between your access details, election list, ballot, and review panel."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <PortalNavCard
            active={!selectedOrganization}
            description={selectedOrganization ? selectedOrganization.name : "Choose your organization first."}
            label="Access"
            onClick={() => scrollToPortalSection("portal-access")}
          />
          <PortalNavCard
            active={Boolean(selectedOrganization) && !selectedElection}
            description={selectedElection ? selectedElection.title : "See open and recent elections."}
            label="Elections"
            onClick={() => scrollToPortalSection("portal-elections")}
          />
          <PortalNavCard
            active={Boolean(selectedElection)}
            description={selectedElection ? "Review offices and make your selections." : "Choose an election to open the ballot."}
            label="Ballot"
            onClick={() => scrollToPortalSection("portal-ballot")}
          />
          <PortalNavCard
            active={hasSubmittedBallot}
            description={hasSubmittedBallot ? "Your ballot has been submitted." : "Check your choices before you submit."}
            label="Review"
            onClick={() => scrollToPortalSection("portal-review")}
          />
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <div id="portal-access">
            <SectionCard title="Your access" description={session.user.email}>
              <div className="space-y-1">
                <p className="font-[family:var(--font-heading)] text-3xl">
                  {session.user.firstName} {session.user.lastName}
                </p>
                <p className="text-sm text-[color:var(--muted-foreground)]">Your voter account</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <MetricCard label="Organizations" value={organizations.length} />
                <MetricCard label="Open elections" value={openElections.length} />
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Organizations" description={isLoadingOrganizations ? "Loading organizations..." : "Choose an organization."}>
            {organizations.length === 0 ? (
              <p className="text-sm text-[color:var(--muted-foreground)]">No organizations are linked to this account yet.</p>
            ) : (
              <div className="space-y-3">
                {organizations.map((organization) => (
                  <button
                    key={organization.id}
                    className={`w-full rounded-[calc(var(--radius)-0.125rem)] border p-4 text-left transition ${
                      organization.id === selectedOrganizationId
                        ? "border-[color:var(--primary)]/40 bg-[color:var(--secondary)]/70"
                        : "border-[color:var(--border)] bg-white hover:bg-[color:var(--muted)]/70"
                    }`}
                    onClick={() => setSelectedOrganizationId(organization.id)}
                    type="button"
                  >
                    <p className="font-semibold">{organization.name}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                      {organization.description ?? "No description yet."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="outline">{organization._count?.elections ?? 0} elections</Badge>
                      <Badge variant="outline">{organization._count?.members ?? 1} members</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          <div id="portal-elections">
            <SectionCard title="Elections" description={isLoadingElections ? "Refreshing elections..." : "Open elections are shown first."}>
              {elections.length === 0 ? (
                <p className="text-sm text-[color:var(--muted-foreground)]">No elections available for this organization yet.</p>
              ) : (
                <div className="space-y-4">
                  {[
                    { groupTitle: "Open now", items: openElections },
                    { groupTitle: "Other elections", items: completedElections }
                  ].map(({ groupTitle, items }) =>
                    items.length > 0 ? (
                      <div key={groupTitle} className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                          {groupTitle}
                        </p>
                        <div className="space-y-3">
                          {items.map((election) => (
                            <button
                              key={election.id}
                              className={`w-full rounded-[calc(var(--radius)-0.125rem)] border p-4 text-left transition ${
                                election.id === selectedElectionId
                                  ? "border-[color:var(--primary)]/40 bg-[color:var(--secondary)]/70"
                                  : "border-[color:var(--border)] bg-white hover:bg-[color:var(--muted)]/70"
                              }`}
                              onClick={() => setSelectedElectionId(election.id)}
                              type="button"
                            >
                              <p className="font-semibold">{election.title}</p>
                              <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
                                {election.description ?? "No description yet."}
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <StatusBadge status={election.status} />
                                <Badge variant="outline">{election._count?.offices ?? 0} offices</Badge>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </SectionCard>
          </div>
        </aside>

        <div className="space-y-6">
          {!selectedOrganization ? (
            <EmptyState
              title="Choose an organization"
              body="Select one of your organizations to see available elections and ballots."
            />
          ) : !selectedElection ? (
            <EmptyState
              title="Select an election"
              body="Choose an election to review the offices and candidates."
            />
          ) : (
            <>
              <div id="portal-ballot" className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
                <SectionCard
                  title={selectedElection.title}
                  description={selectedElection.description ?? "No description yet."}
                >
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={selectedElection.status} />
                    <Badge variant="outline">{selectedElection._count?.offices ?? 0} offices</Badge>
                    <Badge variant="outline">Starts {formatDateTime(selectedElection.startsAt)}</Badge>
                    <Badge variant="outline">Ends {formatDateTime(selectedElection.endsAt)}</Badge>
                  </div>
                </SectionCard>
                <SectionCard title={`${completionPercent}% complete`} description="Ballot progress">
                  <Progress value={completionPercent} />
                  <p className="text-sm text-[color:var(--muted-foreground)]">
                    {hasSubmittedBallot
                      ? "Your ballot has been submitted for this election."
                      : ballotIsOpen
                        ? "Choose one candidate in each office. You can only submit once."
                        : "Voting will open when this election is marked OPEN."}
                  </p>
                </SectionCard>
              </div>

              <SectionCard
                title={selectedElection.title}
                description={`${selectedOrganization.name} · Choose one candidate in each office.`}
                action={<StatusBadge status={selectedElection.status} />}
              >
                {isLoadingBallot ? (
                  <p className="text-sm text-[color:var(--muted-foreground)]">Loading ballot...</p>
                ) : !ballotState ? (
                  <p className="text-sm text-[color:var(--muted-foreground)]">The ballot could not be loaded for this election.</p>
                ) : ballotState.offices.length === 0 ? (
                  <p className="text-sm text-[color:var(--muted-foreground)]">This election has no offices yet, so there is no ballot to cast.</p>
                ) : (
                  <form className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]" onSubmit={handleSubmitBallot}>
                    <div className="space-y-4">
                      {ballotState.offices.map((office) => (
                        <Card key={office.id} className="border-white/70 bg-white/95">
                          <CardContent className="space-y-4 p-5">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="space-y-1">
                                <h3 className="font-[family:var(--font-heading)] text-2xl">{office.title}</h3>
                                <p className="text-sm text-[color:var(--muted-foreground)]">
                                  {office.description ?? "No description yet."}
                                </p>
                              </div>
                              <Badge variant="outline">{office.seats} seat{office.seats === 1 ? "" : "s"}</Badge>
                            </div>

                            <RadioGroup
                              value={ballotSelections[office.id] ?? ""}
                              onValueChange={(nextValue) =>
                                setBallotSelections((current) => ({
                                  ...current,
                                  [office.id]: nextValue
                                }))
                              }
                              className="space-y-3"
                            >
                              {office.candidates.map((candidate) => {
                                const isSelected = ballotSelections[office.id] === candidate.id;

                                return (
                                  <label
                                    key={candidate.id}
                                    className={`flex cursor-pointer gap-4 rounded-[calc(var(--radius)-0.25rem)] border p-4 transition ${
                                      isSelected
                                        ? "border-[color:var(--primary)]/35 bg-[color:var(--secondary)]/70"
                                        : "border-[color:var(--border)] bg-[color:var(--card)] hover:bg-[color:var(--muted)]/60"
                                    }`}
                                  >
                                    <RadioGroupItem
                                      value={candidate.id}
                                      id={`${office.id}-${candidate.id}`}
                                      disabled={hasSubmittedBallot || !ballotIsOpen}
                                      className="mt-1"
                                    />
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-semibold">{candidate.displayName}</p>
                                        {isSelected ? <Badge variant="success">Selected</Badge> : null}
                                      </div>
                                      <p className="text-sm text-[color:var(--muted-foreground)]">
                                        {candidate.bio ?? "No bio yet."}
                                      </p>
                                    </div>
                                  </label>
                                );
                              })}
                            </RadioGroup>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <div id="portal-review">
                      <ReviewPanel
                        title="Review your ballot"
                        subtitle="Check your choices before you submit."
                        progress={completionPercent}
                        stats={[
                          {
                            label: "Completed",
                            value: `${selectedCount}/${totalOffices}`
                          },
                          {
                            label: "Election state",
                            value: toTitleCase(ballotState.election.status)
                          }
                        ]}
                        items={reviewItems}
                        actions={
                          <Button
                            className="w-full"
                            disabled={
                              activeAction === "submit-ballot" ||
                              hasSubmittedBallot ||
                              ballotState.election.status !== "OPEN"
                            }
                            type="submit"
                          >
                            {hasSubmittedBallot
                              ? "Ballot submitted"
                              : activeAction === "submit-ballot"
                                ? "Submitting..."
                                : "Submit ballot"}
                          </Button>
                        }
                        notes={
                          hasSubmittedBallot
                            ? "Your vote has been recorded."
                            : "You can only submit once for this election."
                        }
                      />
                    </div>
                  </form>
                )}
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </PageShell>
  );
}
