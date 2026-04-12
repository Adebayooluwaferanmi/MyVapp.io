import { useEffect, useState } from "react";

import { AuthCard } from "./components/AuthCard";
import { VoterPortal } from "./components/VoterPortal";
import { Workspace } from "./components/Workspace";
import { getCurrentUser, getHealthStatus } from "./lib/services";
import type { AuthResponse, StoredSession } from "./types";

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

function connectionPillClass(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("not reachable") || lower.includes("checking")) {
    return lower.includes("checking") ? "connection-pill" : "connection-pill connection-pill--warn";
  }
  if (lower.includes("ok")) {
    return "connection-pill connection-pill--ok";
  }
  return "connection-pill connection-pill--warn";
}

type SiteHeaderProps = {
  healthMessage: string;
  showMarketingNav?: boolean;
};

function SiteHeader({ healthMessage, showMarketingNav = true }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <a className="logo-block" href="/">
          <span className="logo-block__mark" aria-hidden>
            MV
          </span>
          <span className="logo-block__text">
            <span className="logo-block__name">MyVapp</span>
            <span className="logo-block__tag">Election management</span>
          </span>
        </a>

        {showMarketingNav ? (
          <nav className="site-nav" aria-label="Sections">
            <a href="#pillars">Platform</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#access">Access</a>
          </nav>
        ) : (
          <span className="site-header__context">Workspace</span>
        )}

        <div className="site-header__actions">
          <span className={connectionPillClass(healthMessage)} title={healthMessage}>
            {healthMessage}
          </span>
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <span>© {new Date().getFullYear()} MyVapp. Secure voting workflows for organizations.</span>
        <div className="site-footer__links">
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
  const [healthMessage, setHealthMessage] = useState("Checking API…");

  useEffect(() => {
    getHealthStatus()
      .then((result) => setHealthMessage(`${result.service} is ${result.status}.`))
      .catch(() => setHealthMessage("API is not reachable yet."));
  }, []);

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

  if (session) {
    const isVoterOnly = session.user.role === "VOTER";

    return (
      <div className="app-root">
        <SiteHeader healthMessage={healthMessage} showMarketingNav={false} />
        <main className="page-shell">
          {isVoterOnly ? (
            <VoterPortal
              healthMessage={healthMessage}
              onLogout={handleLogout}
              onRefreshProfile={refreshProfile}
              session={session}
            />
          ) : (
            <Workspace
              healthMessage={healthMessage}
              onLogout={handleLogout}
              onRefreshProfile={refreshProfile}
              session={session}
            />
          )}
        </main>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="app-root">
      <SiteHeader healthMessage={healthMessage} />

      <main className="page-shell page-shell--auth">
        <section className="hero panel hero-panel" id="overview">
          <div className="hero-layout">
            <div className="hero-copy">
              <p className="landing-section-title">Enterprise-ready voting</p>
              <h1>Run secure, auditable elections your members can trust.</h1>
              <p className="lead">
                MyVapp connects your React workspace to a hardened API and PostgreSQL data layer:
                organizations, elections, offices, ballots, and role-aware results in one coherent
                flow.
              </p>
              <div className="status-strip">
                <span>{healthMessage}</span>
                <span>React · TypeScript · Vite</span>
                <span>REST API · Prisma · PostgreSQL</span>
              </div>
            </div>

            <div className="hero-grid" aria-label="Highlights">
              <article className="panel stat-card">
                <h3>Multi-tenant governance</h3>
                <p>
                  Isolate organizations, roles, and ballots so each council or chapter operates with
                  clear boundaries.
                </p>
              </article>
              <article className="panel stat-card">
                <h3>Live operational data</h3>
                <p>
                  Every dashboard action maps to your API—ready for production traffic and
                  observability.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="trust-strip" id="pillars" aria-labelledby="pillars-heading">
          <h2 className="sr-only" id="pillars-heading">
            Platform pillars
          </h2>
          <div className="trust-strip__grid">
            <article className="trust-card">
              <div className="trust-card__icon trust-card__icon--blue" aria-hidden>
                ◆
              </div>
              <h3>Security by design</h3>
              <p>JWT authentication, least-privilege roles, and structured validation at the API boundary.</p>
            </article>
            <article className="trust-card">
              <div className="trust-card__icon trust-card__icon--teal" aria-hidden>
                ◇
              </div>
              <h3>Operational clarity</h3>
              <p>Guided setup, election lifecycle controls, and manager-facing tallies without spreadsheets.</p>
            </article>
            <article className="trust-card">
              <div className="trust-card__icon trust-card__icon--amber" aria-hidden>
                ▣
              </div>
              <h3>Responsive delivery</h3>
              <p>Column-based layouts that scale from boardroom displays to mobile field voting.</p>
            </article>
          </div>
        </section>

        <section className="auth-layout">
          <div id="access">
            <AuthCard onAuthenticated={handleAuthenticated} />
          </div>

          <section className="panel roadmap-panel" id="capabilities">
            <p className="landing-section-title">Capabilities</p>
            <h2>What this workspace delivers today</h2>
            <ul className="feature-list">
              <li>Register and sign in with secured JWT sessions.</li>
              <li>Create and switch organizations in real time.</li>
              <li>Manage elections, offices, and candidate profiles.</li>
              <li>Cast ballots and review role-aware results in one dashboard.</li>
            </ul>

            <div className="vision-grid">
              <article className="vision-card">
                <span className="vision-card__label">Managers</span>
                <strong>Configure offices, publish elections, and monitor vote totals.</strong>
              </article>
              <article className="vision-card">
                <span className="vision-card__label">Voters</span>
                <strong>Access open ballots, vote once per election, and confirm submission state.</strong>
              </article>
              <article className="vision-card">
                <span className="vision-card__label">Platform</span>
                <strong>Keep frontend, API, and database behavior aligned in one product flow.</strong>
              </article>
            </div>
          </section>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
