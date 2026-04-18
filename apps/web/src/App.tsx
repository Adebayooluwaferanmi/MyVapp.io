import {
  ArrowRight,
  CheckCircle2,
  FolderKanban,
  LayoutPanelTop,
  Mail,
  ShieldCheck,
  Users,
  Vote
} from "lucide-react";
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
            <a href="#managers">For managers</a>
            <a href="#voters">For voters</a>
            <a href="#access">Get started</a>
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

  function persistSession(nextSession: StoredSession) {
    window.localStorage.setItem("myvapp.session", JSON.stringify(nextSession));
    setSession(nextSession);
  }

  function handleAuthenticated(payload: AuthResponse, preferredView?: "workspace" | "voter") {
    const nextSession = {
      token: payload.token,
      user: payload.user,
      preferredView: preferredView ?? (payload.user.role === "VOTER" ? "voter" : "workspace")
    };

    persistSession(nextSession);
  }

  function handleLogout() {
    window.localStorage.removeItem("myvapp.session");
    setSession(null);
  }

  function setPreferredView(preferredView: "workspace" | "voter") {
    if (!session) {
      return;
    }

    persistSession({
      ...session,
      preferredView
    });
  }

  function handleThemeChange(theme: OrganizationThemeInput) {
    setTheme(theme);
  }

  if (session) {
    const isVoterOnly = session.user.role === "VOTER" || session.preferredView === "voter";

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
              onSwitchToWorkspace={
                session.user.role === "VOTER" ? undefined : () => setPreferredView("workspace")
              }
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
      <main className="mx-auto w-[min(1440px,calc(100%-1.25rem))] space-y-12 py-8 md:space-y-16 md:py-10 xl:space-y-20">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--card)_92%,white),color-mix(in_srgb,var(--secondary)_52%,white))] shadow-[0_36px_110px_-56px_rgba(15,23,42,0.55)]">
            <CardContent className="grid gap-8 p-8 md:p-10 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.75fr)]">
              <div className="space-y-6">
                <Badge variant="outline">Election management platform</Badge>
                <div className="space-y-4">
                  <h1 className="max-w-4xl font-[family:var(--font-heading)] text-5xl leading-[0.98] md:text-6xl xl:text-7xl">
                    Set up and run elections without turning the process into admin overhead.
                  </h1>
                  <p className="max-w-2xl text-base leading-7 text-[color:var(--muted-foreground)] md:text-lg">
                    MyVapp is built first for managers: create elections, import the voter registry,
                    send claim links, open voting, and review turnout and results from one place.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="success">{healthMessage}</Badge>
                  <Badge variant="outline">Registry import</Badge>
                  <Badge variant="outline">Invite claim flow</Badge>
                  <Badge variant="outline">Manager workspace</Badge>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => document.getElementById("access")?.scrollIntoView({ behavior: "smooth" })} type="button">
                    Set up and run an election
                    <ArrowRight className="size-4" />
                  </Button>
                  <Button
                    onClick={() => document.getElementById("voters")?.scrollIntoView({ behavior: "smooth" })}
                    type="button"
                    variant="outline"
                  >
                    Access your election
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 self-start">
                {[
                  ["Create the election", "Build the event, add offices, and prepare the ballot structure."],
                  ["Import the voter registry", "Upload CSV or XLSX, review errors, and commit clean eligibility records."],
                  ["Send invites and run voting", "Email one-time claim links, open voting, and track turnout without exposing live tallies."]
                ].map(([title, body], index) => (
                  <div key={title} className="rounded-[calc(var(--radius)-0.25rem)] border border-white/80 bg-white/85 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">
                      0{index + 1}
                    </p>
                    <p className="mt-3 font-semibold">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">{body}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card id="access" className="border-white/70 bg-white/95 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.4)]">
            <CardHeader className="space-y-3">
              <Badge variant="outline">Get started</Badge>
              <CardTitle>Managers start here</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3 rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/55 p-4">
                <p className="font-semibold">Use the workspace to:</p>
                <div className="space-y-3">
                  {[
                    "Create organizations and elections.",
                    "Import your voter registry and send claim links.",
                    "Open voting, monitor turnout, and review results after close."
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 size-4 text-[color:var(--success)]" />
                      <p className="text-sm text-[color:var(--muted-foreground)]">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
              <AuthCard onAuthenticated={handleAuthenticated} />
            </CardContent>
          </Card>
        </section>

        <section id="managers" className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Card className="border-white/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_96%,white),white)]">
            <CardContent className="space-y-6 p-7 md:p-8">
              <Badge variant="outline">For managers</Badge>
              <div className="space-y-3">
                <h2 className="font-[family:var(--font-heading)] text-4xl leading-tight md:text-5xl">
                  One workspace for setup, registry, turnout, and results.
                </h2>
                <p className="max-w-2xl text-base leading-7 text-[color:var(--muted-foreground)]">
                  The manager path is the main path: you should be able to tell what to do next
                  without hunting through a voter-shaped interface.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                Icon: FolderKanban,
                title: "Set up the event",
                body: "Create the election, choose dates, add offices, and keep the structure in one view."
              },
              {
                Icon: Users,
                title: "Manage eligibility",
                body: "Import the voter registry, review invalid rows, and send secure one-time claim links."
              },
              {
                Icon: ShieldCheck,
                title: "Run with control",
                body: "Watch turnout while voting is open and keep candidate tallies hidden until the election closes."
              }
            ].map(({ Icon, title, body }) => (
              <Card key={title} className="border-white/70 bg-white/95">
                <CardContent className="space-y-4 p-6">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),var(--accent))] text-white">
                    <Icon className="size-5" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-[family:var(--font-heading)] text-2xl">{title}</h3>
                    <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">{body}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section id="voters" className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
          <Card className="border-white/70 bg-white/95">
            <CardContent className="grid gap-6 p-7 md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)]">
              <div className="space-y-5">
                <Badge variant="outline">For voters</Badge>
                <div className="space-y-3">
                  <h2 className="font-[family:var(--font-heading)] text-4xl leading-tight">A direct path in, not a maze.</h2>
                  <p className="max-w-2xl text-base leading-7 text-[color:var(--muted-foreground)]">
                    Voters receive a claim link by email, confirm their member ID, and enter the
                    election only when access is valid for that event.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    ["01", "Open the invite", "Use the link from email to reach the election access page."],
                    ["02", "Confirm your ID", "Enter the member ID from the voter registry to claim access."],
                    ["03", "Vote when open", "Review each office, submit once, and see results after the election closes."]
                  ].map(([step, title, body]) => (
                    <div key={step} className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/55 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted-foreground)]">{step}</p>
                      <p className="mt-3 font-semibold">{title}</p>
                      <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">{body}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[linear-gradient(180deg,white,color-mix(in_srgb,var(--secondary)_55%,white))] p-5">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-[color:var(--secondary)] text-[color:var(--primary)]">
                  <Mail className="size-5" />
                </div>
                <p className="mt-5 font-semibold">Already have an invite?</p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--muted-foreground)]">
                  Open the link from your email, or sign in if you have already claimed access and want to return to your election.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            {[
              {
                Icon: Vote,
                title: "Ballot flow stays simple",
                body: "Status, offices, and final review stay close to the ballot so voters never have to guess what comes next."
              },
              {
                Icon: LayoutPanelTop,
                title: "Results stay controlled",
                body: "Managers watch turnout while voting is open; tallies wait until the election closes."
              }
            ].map(({ Icon, title, body }) => (
              <Card key={title} className="border-white/70 bg-white/95">
                <CardContent className="space-y-4 p-6">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),var(--accent))] text-white">
                    <Icon className="size-5" />
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
      </main>
      <SiteFooter />
    </div>
  );
}
