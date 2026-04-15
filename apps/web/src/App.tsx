import { CheckCircle2, LayoutPanelTop, ShieldCheck, Vote } from "lucide-react";
import { useEffect, useState } from "react";

import { AuthCard } from "@/components/AuthCard";
import { PublicClaimPage } from "@/components/PublicClaimPage";
import { VoterPortal } from "@/components/VoterPortal";
import { Workspace } from "@/components/Workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppTheme, type OrganizationThemeInput } from "@/lib/theme";
import { getCurrentUser, getHealthStatus } from "@/lib/services";
import type { AuthResponse, StoredSession } from "@/types";

function getStoredSession(): StoredSession | null {
  const raw = window.localStorage.getItem("myvapp.session");

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function connectionTone(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("online") || lower.includes("connected")) {
    return "success" as const;
  }

  if (lower.includes("checking")) {
    return "outline" as const;
  }

  return "warning" as const;
}

function getPublicClaimRoute(pathname: string) {
  const match = pathname.match(/^\/claim\/([^/]+)\/?$/);

  if (!match) {
    return null;
  }

  return {
    electionSlug: decodeURIComponent(match[1])
  };
}

function SiteHeader({
  healthMessage,
  showMarketingNav = true
}: {
  healthMessage: string;
  showMarketingNav?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-[color:var(--border)]/80 bg-[color:var(--background)]/95 backdrop-blur">
      <div className="mx-auto flex min-h-20 w-[min(1280px,calc(100%-1.5rem))] items-center justify-between gap-4 py-3">
        <a className="flex items-center gap-3 text-[color:var(--foreground)] no-underline" href="/">
          <div className="flex size-11 items-center justify-center rounded-[calc(var(--radius)-0.125rem)] bg-[linear-gradient(135deg,var(--primary),var(--accent))] text-sm font-bold text-white shadow-lg">
            MV
          </div>
          <div className="space-y-0.5">
            <p className="font-[family:var(--font-heading)] text-xl font-semibold">MyVapp</p>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
              Election management
            </p>
          </div>
        </a>

        {showMarketingNav ? (
          <nav className="hidden items-center gap-6 text-sm font-medium text-[color:var(--muted-foreground)] lg:flex">
            <a href="#principles">Why it works</a>
            <a href="#flow">How it works</a>
            <a href="#access">Access</a>
          </nav>
        ) : (
          <Badge variant="outline">Workspace</Badge>
        )}

        <Badge variant={connectionTone(healthMessage)}>{healthMessage}</Badge>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-[color:var(--border)] bg-white/70">
      <div className="mx-auto flex w-[min(1280px,calc(100%-1.5rem))] flex-col justify-between gap-4 py-8 text-sm text-[color:var(--muted-foreground)] md:flex-row md:items-center">
        <p>© {new Date().getFullYear()} MyVapp. Run elections for your organization.</p>
        <div className="flex flex-wrap gap-4">
          <a href="#privacy">Privacy</a>
          <a href="#terms">Terms</a>
          <a href="#security">Security</a>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const [session, setSession] = useState<StoredSession | null>(() => getStoredSession());
  const [healthMessage, setHealthMessage] = useState("Checking connection...");
  const { setTheme } = useAppTheme();
  const publicClaimRoute = getPublicClaimRoute(window.location.pathname);

  useEffect(() => {
    getHealthStatus()
      .then((result) =>
        setHealthMessage(result.status.toLowerCase() === "ok" ? "API online" : "Connection available")
      )
      .catch((error) =>
        setHealthMessage(error instanceof Error ? error.message : "Cannot reach the API right now.")
      );
  }, []);

  useEffect(() => {
    if (!session) {
      setTheme({ themePreset: "myvapp-default" });
    }
  }, [session, setTheme]);

  async function refreshProfile() {
    if (!session) {
      return;
    }

    try {
      const payload = await getCurrentUser(session.token);

      const nextSession = {
        ...session,
        user: payload.user
      };

      window.localStorage.setItem("myvapp.session", JSON.stringify(nextSession));
      setSession(nextSession);
    } catch (error) {
      console.error(error);
    }
  }

  function handleAuthenticated(payload: AuthResponse) {
    const nextSession = {
      token: payload.token,
      user: payload.user
    };

    window.localStorage.setItem("myvapp.session", JSON.stringify(nextSession));
    setSession(nextSession);
  }

  function handleLogout() {
    window.localStorage.removeItem("myvapp.session");
    setSession(null);
  }

  function handleThemeChange(theme: OrganizationThemeInput) {
    setTheme(theme);
  }

  if (session) {
    const isVoterOnly = session.user.role === "VOTER";

    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_35%),radial-gradient(circle_at_bottom_left,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_40%),var(--background)] text-[color:var(--foreground)]">
        <SiteHeader healthMessage={healthMessage} showMarketingNav={false} />
        <main className="mx-auto w-[min(1380px,calc(100%-1.25rem))] py-6 md:py-8">
          {isVoterOnly ? (
            <VoterPortal
              healthMessage={healthMessage}
              onLogout={handleLogout}
              onRefreshProfile={refreshProfile}
              onThemeChange={handleThemeChange}
              session={session}
            />
          ) : (
            <Workspace
              healthMessage={healthMessage}
              onLogout={handleLogout}
              onRefreshProfile={refreshProfile}
              onThemeChange={handleThemeChange}
              session={session}
            />
          )}
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (publicClaimRoute) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_35%),radial-gradient(circle_at_bottom_left,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_40%),var(--background)] text-[color:var(--foreground)]">
        <SiteHeader healthMessage={healthMessage} showMarketingNav={false} />
        <main className="mx-auto w-[min(1280px,calc(100%-1.25rem))] py-8 md:py-10">
          <PublicClaimPage
            electionSlug={publicClaimRoute.electionSlug}
            healthMessage={healthMessage}
            onAuthenticated={handleAuthenticated}
          />
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_35%),radial-gradient(circle_at_bottom_left,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_40%),var(--background)] text-[color:var(--foreground)]">
      <SiteHeader healthMessage={healthMessage} />
      <main className="mx-auto w-[min(1280px,calc(100%-1.25rem))] space-y-12 py-8 md:space-y-16 md:py-10">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(22rem,0.7fr)]">
          <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--card)_92%,white),color-mix(in_srgb,var(--secondary)_65%,white))]">
            <CardContent className="space-y-6 p-8 md:p-10">
              <Badge variant="outline">Simple election software</Badge>
              <div className="space-y-4">
                <h1 className="max-w-3xl font-[family:var(--font-heading)] text-5xl leading-[1.02] md:text-6xl">
                  Run your election without the clutter.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[color:var(--muted-foreground)] md:text-lg">
                  Set up elections, manage members, and let people vote in a flow that is easy to
                  follow from start to finish.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">{healthMessage}</Badge>
                <Badge variant="outline">Clear ballot flow</Badge>
                <Badge variant="outline">Admin and voter views</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/70 bg-white/95">
            <CardHeader className="space-y-3">
              <Badge variant="outline">What matters</Badge>
              <CardTitle>What voters need to see</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                ["A clear order", "People should always know what comes next: choose, review, then submit."],
                ["Important details nearby", "Status, dates, and voting rules should sit close to the ballot."],
                ["Choices that are easy to read", "Candidates should be easy to compare without making the page feel busy."]
              ].map(([title, body]) => (
                <div key={title} className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/55 p-4">
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <section id="principles" className="grid gap-4 md:grid-cols-3">
          {[
            {
              Icon: ShieldCheck,
              title: "Clear choices",
              body: "Voters should be able to compare candidates quickly without sorting through clutter."
            },
            {
              Icon: Vote,
              title: "Status and dates",
              body: "Election status, start time, end time, and progress should stay easy to find."
            },
            {
              Icon: LayoutPanelTop,
              title: "Review before submit",
              body: "A simple summary helps people check their choices before they send a final vote."
            }
          ].map(({ Icon, title, body }) => (
            <Card key={title} className="border-white/70 bg-white/95">
              <CardContent className="space-y-4 p-6">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),var(--accent))] text-white">
                  <Icon className="size-5" />
                </div>
                <div className="space-y-2">
                  <h2 className="font-[family:var(--font-heading)] text-2xl">{title}</h2>
                  <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">{body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section id="flow" className="space-y-5">
          <div className="space-y-2">
            <Badge variant="outline">How it works</Badge>
            <h2 className="font-[family:var(--font-heading)] text-4xl">A simple voting flow</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["01", "Pick your election", "Start by choosing the organization and election you want to work on."],
              ["02", "Review each office", "Candidates are grouped by office so voters can make one clear choice at a time."],
              ["03", "Check your ballot", "A review panel keeps your progress and selections in one place."],
              ["04", "Manage from one workspace", "Admins can set up elections, open voting, and check results without jumping around."]
            ].map(([step, title, body]) => (
              <Card key={step} className="border-white/70 bg-white/95">
                <CardContent className="space-y-4 p-6">
                  <div className="flex size-12 items-center justify-center rounded-full bg-[color:var(--secondary)] text-sm font-bold text-[color:var(--primary)]">
                    {step}
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-semibold">{title}</h3>
                    <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">{body}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="access" className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <AuthCard onAuthenticated={handleAuthenticated} />
          <Card className="border-white/70 bg-white/95">
            <CardHeader className="space-y-3">
              <Badge variant="outline">Who it's for</Badge>
              <CardTitle>Built for admins and voters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3">
                {[
                  "Create an account and sign in securely.",
                  "Switch between organizations without losing your place.",
                  "Set up elections, offices, and candidates in one workspace.",
                  "Vote with a simple ballot and a final review step."
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/50 p-3">
                    <CheckCircle2 className="mt-0.5 size-4 text-[color:var(--success)]" />
                    <p className="text-sm text-[color:var(--muted-foreground)]">{item}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ["Managers", "Create elections, manage members, and keep voting on track."],
                  ["Voters", "Open a ballot, choose candidates, and submit once."],
                  ["Platform", "Keep the frontend, API, and voting flow working together cleanly."]
                ].map(([title, body]) => (
                  <div key={title} className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">{title}</p>
                    <p className="mt-3 text-sm leading-6 text-[color:var(--foreground)]">{body}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
