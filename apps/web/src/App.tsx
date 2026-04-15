import { CheckCircle2, LayoutPanelTop, ShieldCheck, Vote } from "lucide-react";
import { useEffect, useState } from "react";

import { AuthCard } from "@/components/AuthCard";
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

  if (lower.includes("ok")) {
    return "success" as const;
  }

  if (lower.includes("checking")) {
    return "outline" as const;
  }

  return "warning" as const;
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
            <a href="#principles">Principles</a>
            <a href="#flow">Flow</a>
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
        <p>© {new Date().getFullYear()} MyVapp. Trusted voting workflows for organizations.</p>
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
  const [healthMessage, setHealthMessage] = useState("Checking API...");
  const { setTheme } = useAppTheme();

  useEffect(() => {
    getHealthStatus()
      .then((result) => setHealthMessage(`${result.service} is ${result.status}.`))
      .catch(() => setHealthMessage("API is not reachable yet."));
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_35%),radial-gradient(circle_at_bottom_left,color-mix(in_srgb,var(--accent)_12%,transparent),transparent_40%),var(--background)] text-[color:var(--foreground)]">
      <SiteHeader healthMessage={healthMessage} />
      <main className="mx-auto w-[min(1280px,calc(100%-1.25rem))] space-y-12 py-8 md:space-y-16 md:py-10">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(22rem,0.7fr)]">
          <Card className="overflow-hidden border-white/70 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--card)_92%,white),color-mix(in_srgb,var(--secondary)_65%,white))]">
            <CardContent className="space-y-6 p-8 md:p-10">
              <Badge variant="outline">Research-informed voting interface</Badge>
              <div className="space-y-4">
                <h1 className="max-w-3xl font-[family:var(--font-heading)] text-5xl leading-[1.02] md:text-6xl">
                  A voting app should feel calm, clear, and trustworthy from the first screen.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[color:var(--muted-foreground)] md:text-lg">
                  MyVapp centers the patterns that repeatedly show up in strong election interfaces:
                  simple hierarchy, visible status windows, clear review steps, and ballot surfaces
                  that help people confirm intent before they submit.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">{healthMessage}</Badge>
                <Badge variant="outline">Readable ballot flow</Badge>
                <Badge variant="outline">Role-based workspace</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/70 bg-white/95">
            <CardHeader className="space-y-3">
              <Badge variant="outline">Launch checklist</Badge>
              <CardTitle>What strong voting UIs keep visible</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                ["Clear progression", "Selection, review, submission, and results each need their own visual stage."],
                ["Trust cues in context", "Status, deadlines, and one-ballot rules should stay near the action."],
                ["Readable choices", "Candidate options should be easy to compare without feeling like raw form controls."]
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
              title: "Simple ballot surfaces",
              body: "Voters should see one office at a time, clear candidate cards, and less visual clutter."
            },
            {
              Icon: Vote,
              title: "Visible status and timing",
              body: "Election state, start and end windows, and completion progress stay in view while voting."
            },
            {
              Icon: LayoutPanelTop,
              title: "Review before cast",
              body: "A clear summary panel helps people verify choices before they commit a one-time submission."
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
            <Badge variant="outline">How the front end is organized</Badge>
            <h2 className="font-[family:var(--font-heading)] text-4xl">Built around the natural rhythm of online voting</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ["01", "Choose context first", "Users select the organization and election before the interface asks them to take action."],
              ["02", "Read choices clearly", "Each office is separated, candidates are easier to compare, and deadlines stay visible."],
              ["03", "Review in one place", "A dedicated review panel keeps progress, pending offices, and selected candidates together."],
              ["04", "Manage with less clutter", "Admins get a more organized lifecycle view for setup, voting, results, and audit activity."]
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
              <Badge variant="outline">Role-based entry</Badge>
              <CardTitle>Designed for both election managers and voters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3">
                {[
                  "Register and sign in with secured JWT sessions.",
                  "Create or switch organizations without losing context.",
                  "Manage elections through clearer lifecycle stages instead of scattered tools.",
                  "Cast ballots through candidate cards and a review-first submission flow."
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-[calc(var(--radius)-0.25rem)] border border-[color:var(--border)] bg-[color:var(--muted)]/50 p-3">
                    <CheckCircle2 className="mt-0.5 size-4 text-[color:var(--success)]" />
                    <p className="text-sm text-[color:var(--muted-foreground)]">{item}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ["Managers", "See the next action, monitor readiness, and manage election status with less noise."],
                  ["Voters", "Access open ballots, review each office clearly, and confirm submission with confidence."],
                  ["Platform", "Keep frontend, API, and data flow aligned around a realistic election journey."]
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
