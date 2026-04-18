import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  EmptyState,
  PageHeader,
  PageShell,
  SectionCard
} from "@/components/shared/surfaces";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  claimPublicElectionInvite,
  getPublicElectionClaimContext
} from "@/lib/services";
import type { AuthResponse, PublicElectionClaimContext } from "@/types";

type PublicClaimPageProps = {
  electionSlug: string;
  healthMessage: string;
  onAuthenticated: (payload: AuthResponse, preferredView?: "workspace" | "voter") => void;
};

type Notice = {
  tone: "error" | "success";
  text: string;
};

function formatDateTime(value: string | null | undefined) {
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

export function PublicClaimPage({
  electionSlug,
  healthMessage,
  onAuthenticated
}: PublicClaimPageProps) {
  const [memberUniqueId, setMemberUniqueId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [claimContext, setClaimContext] = useState<PublicElectionClaimContext | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("token") ?? "";
  }, []);

  useEffect(() => {
    if (!token) {
      setIsLoadingContext(false);
      setNotice({
        tone: "error",
        text: "This invite link is incomplete. Open the full link from your email and try again."
      });
      return;
    }

    setIsLoadingContext(true);
    setNotice(null);

    getPublicElectionClaimContext(electionSlug, token)
      .then((result) => {
        setClaimContext(result);
      })
      .catch((error) => {
        setClaimContext(null);
        setNotice({
          tone: "error",
          text: error instanceof Error ? error.message : "Unable to load this election invite."
        });
      })
      .finally(() => {
        setIsLoadingContext(false);
      });
  }, [electionSlug, token]);

  async function handleClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      return;
    }

    setIsSubmitting(true);
    setNotice(null);

    try {
      const response = await claimPublicElectionInvite(electionSlug, {
        token,
        memberUniqueId
      });

      setNotice({
        tone: "success",
        text: response.message || "Access confirmed."
      });
      onAuthenticated(response, "voter");
    } catch (error) {
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Unable to confirm this invite."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Election invite"
        title="Confirm your election access"
        description="Check the invite details, confirm your member ID, and continue into the election when access is active."
        actions={
          <Button onClick={() => window.location.assign("/")} type="button" variant="outline">
            Back to home
          </Button>
        }
        meta={
          <>
            <Badge variant="outline">{healthMessage}</Badge>
            <Badge variant="outline">Secure invite claim</Badge>
          </>
        }
      />

      {notice ? (
        <Alert variant={notice.tone === "error" ? "destructive" : "success"}>
          <AlertTitle>{notice.tone === "error" ? "Please check this" : "Done"}</AlertTitle>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}

      {isLoadingContext ? (
        <EmptyState
          title="Loading invite"
          body="We’re checking the election link and invite status."
        />
      ) : !claimContext ? (
        <EmptyState
          title="Invite unavailable"
          body="This election invite could not be loaded. Check the link in your email and try again."
        />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
          <SectionCard
            title={claimContext.election.title}
            description={`${claimContext.election.organizationName} · ${claimContext.invite.email}`}
            className="overflow-hidden"
          >
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.8fr)]">
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{claimContext.election.status}</Badge>
                  <Badge variant="outline">Starts {formatDateTime(claimContext.election.startsAt)}</Badge>
                  <Badge variant="outline">Ends {formatDateTime(claimContext.election.endsAt)}</Badge>
                  <Badge variant="outline">
                    Invite expires {formatDateTime(claimContext.invite.expiresAt)}
                  </Badge>
                </div>

                <div className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--secondary)_72%,white),white)] p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                    Invite status
                  </p>
                  <p className="mt-3 font-[family:var(--font-heading)] text-3xl">
                    {claimContext.invite.canClaim ? "Ready to confirm" : claimContext.invite.status}
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--muted-foreground)]">
                    {claimContext.invite.message}
                  </p>
                </div>

                <form className="space-y-4" onSubmit={handleClaim}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="member-unique-id">
                      Member unique ID
                    </label>
                    <Input
                      id="member-unique-id"
                      required
                      value={memberUniqueId}
                      onChange={(event) => setMemberUniqueId(event.target.value)}
                      placeholder="Enter the member ID from the voter registry"
                    />
                  </div>

                  <Button
                    className="w-full sm:w-auto"
                    disabled={isSubmitting || !claimContext.invite.canClaim}
                    type="submit"
                  >
                    {isSubmitting ? "Confirming..." : "Confirm access"}
                  </Button>
                </form>
              </div>

              <div className="space-y-4 rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-white p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                    What happens next
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                    Once the member ID matches, the app signs you in and takes you into the election
                    flow for this event only.
                  </p>
                </div>
                <div className="space-y-3 text-sm text-[color:var(--muted-foreground)]">
                  <p>The invite must still be active and unused.</p>
                  <p>The member unique ID must match the voter registry for this election.</p>
                  <p>Ballot access opens only during the election window.</p>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Need a different path?"
            description="Managers and voters use different starting points in MyVapp."
          >
            <div className="space-y-3 text-sm text-[color:var(--muted-foreground)]">
              <p>Managers should sign in from the homepage to create elections, import registries, and send invites.</p>
              <p>Voters should use the invite link from email or sign in if they have already claimed access.</p>
            </div>
            <Button onClick={() => window.location.assign("/#access")} type="button" variant="secondary">
              Go to homepage access options
            </Button>
          </SectionCard>
        </div>
      )}
    </PageShell>
  );
}
