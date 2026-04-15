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
  onAuthenticated: (payload: AuthResponse) => void;
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
      onAuthenticated(response);
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
        title="Confirm your election access."
        description="Open the invite, confirm your member ID, and continue into the voting flow."
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <SectionCard
            title={claimContext.election.title}
            description={`Organization: ${claimContext.election.organizationName}`}
          >
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{claimContext.election.status}</Badge>
              <Badge variant="outline">Starts {formatDateTime(claimContext.election.startsAt)}</Badge>
              <Badge variant="outline">Ends {formatDateTime(claimContext.election.endsAt)}</Badge>
              <Badge variant="outline">Invite expires {formatDateTime(claimContext.invite.expiresAt)}</Badge>
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
                  placeholder="Enter the member ID from your voter register"
                />
              </div>

              <Button className="w-full sm:w-auto" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Confirming..." : "Confirm access"}
              </Button>
            </form>
          </SectionCard>

          <SectionCard
            title="Before you continue"
            description="What this page checks before access is granted."
          >
            <div className="space-y-3 text-sm text-[color:var(--muted-foreground)]">
              <p>Your invite must still be active and not already used.</p>
              <p>Your member unique ID must match the election voter registry.</p>
              <p>After confirmation, the app signs you in and takes you into the election flow.</p>
            </div>
          </SectionCard>
        </div>
      )}
    </PageShell>
  );
}
