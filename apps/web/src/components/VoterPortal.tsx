import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  getElectionBallot,
  listElections,
  listOrganizations,
  submitBallot
} from "../lib/services";
import type { BallotState, ElectionSummary, Organization, StoredSession } from "../types";

type VoterPortalProps = {
  healthMessage: string;
  onLogout: () => void;
  onRefreshProfile: () => Promise<void>;
  session: StoredSession;
};

type Notice = {
  tone: "error" | "success";
  text: string;
};

function toTitleCase(value: string): string {
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

function StatusPill({ status }: { status: string }) {
  return <span className={`status-badge status-badge--${status.toLowerCase()}`}>{toTitleCase(status)}</span>;
}

function EmptyState({
  title,
  body
}: {
  title: string;
  body: string;
}) {
  return (
    <section className="panel empty-panel">
      <h3>{title}</h3>
      <p className="muted">{body}</p>
    </section>
  );
}

function FlowStep({
  isActive,
  isComplete,
  label,
  meta
}: {
  isActive: boolean;
  isComplete: boolean;
  label: string;
  meta: string;
}) {
  const stateClass = isComplete ? "complete" : isActive ? "active" : "pending";

  return (
    <article className={`voter-step voter-step--${stateClass}`}>
      <span className="voter-step__marker" aria-hidden>
        {isComplete ? "✓" : "•"}
      </span>
      <div>
        <p className="voter-step__label">{label}</p>
        <strong>{meta}</strong>
      </div>
    </article>
  );
}

export function VoterPortal({
  healthMessage,
  onLogout,
  onRefreshProfile,
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

  const openElections = useMemo(
    () => elections.filter((election) => election.status === "OPEN"),
    [elections]
  );

  const completedElections = useMemo(
    () => elections.filter((election) => election.status !== "OPEN"),
    [elections]
  );

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
        officeId: office.id,
        officeTitle: office.title,
        candidateName: selectedCandidate?.displayName ?? null
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
      const response = await getElectionBallot(session.token, organizationId, electionId);
      setBallotState(response);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to load ballot."
      });
      setBallotState(null);
    } finally {
      setIsLoadingBallot(false);
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
        text: "Your ballot has been submitted successfully."
      });
      await loadBallot(selectedOrganizationId, selectedElectionId);
      await loadElections(selectedOrganizationId, selectedElectionId);
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to submit your ballot."
      });
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <section className="voter-shell">
      <header className="panel voter-hero voter-hero--revamped">
        <div>
          <p className="eyebrow">Voter portal</p>
          <h1>Review the ballot, make your selections, and submit once with confidence.</h1>
          <p className="lead voter-hero__lead">
            This experience follows a familiar election flow: choose the right organization, open the
            active election, review candidates office by office, and confirm your ballot in one clear
            place.
          </p>
          <div className="status-strip">
            <span>{healthMessage}</span>
            <span>{openElections.length} open election{openElections.length === 1 ? "" : "s"}</span>
            <span>{hasSubmittedBallot ? "Submission recorded" : "Submission pending"}</span>
          </div>
        </div>

        <div className="voter-trust-panel">
          <div>
            <span className="detail-label">Election status</span>
            <strong>{selectedElection ? toTitleCase(selectedElection.status) : "Awaiting selection"}</strong>
          </div>
          <div>
            <span className="detail-label">One ballot rule</span>
            <strong>Each voter submits once per election</strong>
          </div>
          <div>
            <span className="detail-label">Audit posture</span>
            <strong>Submission is tracked without exposing vote choices</strong>
          </div>
          <div className="dashboard-actions">
            <button className="secondary-button" onClick={() => void onRefreshProfile()} type="button">
              Refresh profile
            </button>
            <button className="primary-button" onClick={onLogout} type="button">
              Logout
            </button>
          </div>
        </div>
      </header>

      <section className="panel voter-flow-strip" aria-label="Voting steps">
        <div className="voter-flow-grid">
          <FlowStep
            isActive={!selectedOrganization}
            isComplete={Boolean(selectedOrganization)}
            label="Step 1"
            meta={selectedOrganization ? selectedOrganization.name : "Choose organization"}
          />
          <FlowStep
            isActive={Boolean(selectedOrganization) && !selectedElection}
            isComplete={Boolean(selectedElection)}
            label="Step 2"
            meta={selectedElection ? selectedElection.title : "Open election"}
          />
          <FlowStep
            isActive={Boolean(selectedElection) && !hasSubmittedBallot}
            isComplete={selectedCount > 0 || hasSubmittedBallot}
            label="Step 3"
            meta={`${selectedCount}/${totalOffices} offices reviewed`}
          />
          <FlowStep
            isActive={Boolean(selectedElection) && !hasSubmittedBallot}
            isComplete={hasSubmittedBallot}
            label="Step 4"
            meta={hasSubmittedBallot ? "Ballot submitted" : "Confirm and submit"}
          />
        </div>
      </section>

      {notice ? <div className={`notice notice--${notice.tone}`}>{notice.text}</div> : null}

      <section className="voter-layout">
        <aside className="voter-sidebar">
          <section className="panel voter-summary-card">
            <p className="eyebrow">Your access</p>
            <h2>
              {session.user.firstName} {session.user.lastName}
            </h2>
            <p className="muted">{session.user.email}</p>
            <div className="voter-summary-card__stats">
              <div>
                <span className="detail-label">Organizations</span>
                <strong>{organizations.length}</strong>
              </div>
              <div>
                <span className="detail-label">Open elections</span>
                <strong>{openElections.length}</strong>
              </div>
            </div>
          </section>

          <section className="panel organization-panel">
            <div className="panel-header">
              <h2>Organizations</h2>
              {isLoadingOrganizations ? <span className="muted">Loading...</span> : null}
            </div>

            {organizations.length === 0 ? (
              <p className="muted">No organizations are linked to this account yet.</p>
            ) : (
              <div className="selector-list">
                {organizations.map((organization) => (
                  <button
                    key={organization.id}
                    className={organization.id === selectedOrganizationId ? "selector-card active" : "selector-card"}
                    onClick={() => setSelectedOrganizationId(organization.id)}
                    type="button"
                  >
                    <div>
                      <strong>{organization.name}</strong>
                      <p>{organization.description ?? "No organization description provided."}</p>
                    </div>
                    <div className="selector-meta">
                      <span>{organization._count?.elections ?? 0} elections</span>
                      <span>{organization._count?.members ?? 1} members</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="panel voter-election-list">
            <div className="panel-header">
              <h2>Election queue</h2>
              {isLoadingElections ? <span className="muted">Refreshing...</span> : null}
            </div>

            {elections.length === 0 ? (
              <p className="muted">No elections available for this organization yet.</p>
            ) : (
              <>
                {openElections.length > 0 ? (
                  <div className="voter-election-group">
                    <p className="voter-election-group__title">Open now</p>
                    <div className="selector-list">
                      {openElections.map((election) => (
                        <button
                          key={election.id}
                          className={election.id === selectedElectionId ? "selector-card active" : "selector-card"}
                          onClick={() => setSelectedElectionId(election.id)}
                          type="button"
                        >
                          <div>
                            <strong>{election.title}</strong>
                            <p>{election.description ?? "No election description yet."}</p>
                          </div>
                          <div className="selector-meta">
                            <StatusPill status={election.status} />
                            <span>{election._count?.offices ?? 0} offices</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {completedElections.length > 0 ? (
                  <div className="voter-election-group">
                    <p className="voter-election-group__title">Other elections</p>
                    <div className="selector-list">
                      {completedElections.map((election) => (
                        <button
                          key={election.id}
                          className={election.id === selectedElectionId ? "selector-card active" : "selector-card"}
                          onClick={() => setSelectedElectionId(election.id)}
                          type="button"
                        >
                          <div>
                            <strong>{election.title}</strong>
                            <p>{election.description ?? "No election description yet."}</p>
                          </div>
                          <div className="selector-meta">
                            <StatusPill status={election.status} />
                            <span>{election._count?.ballots ?? 0} ballots</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </aside>

        <div className="voter-main">
          {!selectedOrganization ? (
            <EmptyState
              title="Choose an organization"
              body="Select one of your organizations to load available elections and ballots."
            />
          ) : !selectedElection ? (
            <EmptyState
              title="Select an election"
              body="Choose an election from the queue to review its offices and candidates."
            />
          ) : (
            <>
              <section className="voter-brief-grid">
                <article className="panel voter-brief-card">
                  <p className="eyebrow">Selected election</p>
                  <h2>{selectedElection.title}</h2>
                  <p className="muted">
                    {selectedElection.description ?? "This election has no description yet."}
                  </p>
                  <div className="voter-brief-card__meta">
                    <StatusPill status={selectedElection.status} />
                    <span>{selectedElection._count?.offices ?? 0} offices</span>
                    <span>Starts {formatDateTime(selectedElection.startsAt)}</span>
                    <span>Ends {formatDateTime(selectedElection.endsAt)}</span>
                  </div>
                </article>

                <article className="panel voter-brief-card voter-brief-card--accent">
                  <p className="eyebrow">Ballot progress</p>
                  <h3>{completionPercent}% complete</h3>
                  <div className="voter-progress-meter" aria-hidden>
                    <div className="voter-progress-meter__fill" style={{ width: `${completionPercent}%` }} />
                  </div>
                  <p className="muted">
                    {hasSubmittedBallot
                      ? "Your ballot is locked in for this election."
                      : ballotIsOpen
                        ? "Review each office carefully. You can submit only once."
                        : "Voting opens only when the election status is OPEN."}
                  </p>
                </article>
              </section>

              <section className="panel voter-ballot-stage">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Ballot review</p>
                    <h2>{selectedElection.title}</h2>
                    <p className="muted">
                      {selectedOrganization.name} · Review candidates office by office before you submit.
                    </p>
                  </div>
                  <StatusPill status={selectedElection.status} />
                </div>

                {isLoadingBallot ? (
                  <p className="muted">Loading ballot…</p>
                ) : !ballotState ? (
                  <p className="muted">The ballot could not be loaded for this election.</p>
                ) : ballotState.offices.length === 0 ? (
                  <p className="muted">This election has no offices yet, so there is no ballot to cast.</p>
                ) : (
                  <form className="stack-form voter-ballot-form" onSubmit={handleSubmitBallot}>
                    <div className="voter-ballot-shell">
                      <div className="voter-ballot-grid">
                        {ballotState.offices.map((office) => (
                          <fieldset className="voter-office-card" key={office.id}>
                            <legend className="sr-only">{office.title}</legend>
                            <div className="office-card__header">
                              <div>
                                <h3>{office.title}</h3>
                                <p>{office.description ?? "No office description provided."}</p>
                              </div>
                              <span className="seat-count">{office.seats} seat{office.seats === 1 ? "" : "s"}</span>
                            </div>

                            <div className="candidate-choice-grid">
                              {office.candidates.map((candidate) => {
                                const isSelected = ballotSelections[office.id] === candidate.id;

                                return (
                                  <label
                                    className={isSelected ? "candidate-choice candidate-choice--selected" : "candidate-choice"}
                                    key={candidate.id}
                                  >
                                    <input
                                      checked={isSelected}
                                      className="candidate-choice__input"
                                      disabled={hasSubmittedBallot || !ballotIsOpen}
                                      name={`office-${office.id}`}
                                      onChange={() =>
                                        setBallotSelections((current) => ({
                                          ...current,
                                          [office.id]: candidate.id
                                        }))
                                      }
                                      type="radio"
                                      value={candidate.id}
                                    />
                                    <div className="candidate-choice__card">
                                      <div className="candidate-choice__header">
                                        <strong>{candidate.displayName}</strong>
                                        {isSelected ? <span className="candidate-choice__tag">Selected</span> : null}
                                      </div>
                                      <p>{candidate.bio ?? "No candidate bio supplied."}</p>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>
                        ))}
                      </div>

                      <aside className="panel voter-review-card">
                        <p className="eyebrow">Review panel</p>
                        <h3>Before you submit</h3>
                        <div className="voter-review-card__stats">
                          <div>
                            <span className="detail-label">Completed</span>
                            <strong>
                              {selectedCount}/{totalOffices}
                            </strong>
                          </div>
                          <div>
                            <span className="detail-label">Election state</span>
                            <strong>{toTitleCase(ballotState.election.status)}</strong>
                          </div>
                        </div>

                        <div className="voter-progress-meter" aria-hidden>
                          <div className="voter-progress-meter__fill" style={{ width: `${completionPercent}%` }} />
                        </div>

                        <div className="voter-review-list">
                          {reviewItems.map((item) => (
                            <div className="voter-review-list__item" key={item.officeId}>
                              <span>{item.officeTitle}</span>
                              <strong>{item.candidateName ?? "Pending selection"}</strong>
                            </div>
                          ))}
                        </div>

                        <div className="voter-trust-checklist">
                          <div>
                            <strong>Clear instructions</strong>
                            <p>One candidate per office in this current ballot flow.</p>
                          </div>
                          <div>
                            <strong>Transparent status</strong>
                            <p>Start and end times are always visible before submission.</p>
                          </div>
                          <div>
                            <strong>Submission certainty</strong>
                            <p>You will see a confirmed submitted state after your ballot is recorded.</p>
                          </div>
                        </div>

                        <button
                          className="primary-button voter-review-card__button"
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
                              : "Review and submit ballot"}
                        </button>

                        <p className="muted voter-review-card__footnote">
                          {hasSubmittedBallot
                            ? "Your ballot has been recorded for this election."
                            : "Take a final look at the review list before confirming your submission."}
                        </p>
                      </aside>
                    </div>
                  </form>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </section>
  );
}
