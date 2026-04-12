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
            <a href="#principles">Principles</a>
            <a href="#flow">Flow</a>
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
              <p className="landing-section-title">Research-informed voting interface</p>
              <h1>A voting app should feel calm, clear, and trustworthy from the first screen.</h1>
              <p className="lead">
                MyVapp now centers the patterns that show up again and again in strong election
                interfaces: simple hierarchy, clear progress, visible status windows, and a review
                step that helps voters confirm intent before they cast a ballot.
              </p>
              <div className="status-strip">
                <span>{healthMessage}</span>
                <span>Readable ballot flow</span>
                <span>Manager workspace with clearer stages</span>
              </div>
            </div>

            <aside className="panel launch-checklist" aria-label="Launch checklist">
              <p className="landing-section-title">What strong voting UIs keep visible</p>
              <div className="launch-checklist__items">
                <div>
                  <strong>Clear progression</strong>
                  <p>Selection, review, submission, and results each need their own visual stage.</p>
                </div>
                <div>
                  <strong>Trust cues in context</strong>
                  <p>Status, deadlines, and one-ballot rules should stay near the action.</p>
                </div>
                <div>
                  <strong>Readable choices</strong>
                  <p>Candidate options should be easy to compare without feeling like raw form controls.</p>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="trust-strip" id="principles" aria-labelledby="pillars-heading">
          <h2 className="sr-only" id="pillars-heading">
            Design principles
          </h2>
          <div className="trust-strip__grid">
            <article className="trust-card">
              <div className="trust-card__icon trust-card__icon--blue" aria-hidden>
                ◆
              </div>
              <h3>Simple ballot surfaces</h3>
              <p>Voters should see one office at a time, clear candidate cards, and less visual clutter.</p>
            </article>
            <article className="trust-card">
              <div className="trust-card__icon trust-card__icon--teal" aria-hidden>
                ◇
              </div>
              <h3>Visible status and timing</h3>
              <p>Election state, start and end windows, and completion progress stay in view while voting.</p>
            </article>
            <article className="trust-card">
              <div className="trust-card__icon trust-card__icon--amber" aria-hidden>
                ▣
              </div>
              <h3>Review before cast</h3>
              <p>A clear summary panel helps people verify choices before they commit a one-time submission.</p>
            </article>
          </div>
        </section>

        <section className="journey-strip" id="flow">
          <div className="journey-strip__header">
            <p className="landing-section-title">How the front end is organized</p>
            <h2>Built around the natural rhythm of online voting</h2>
          </div>
          <div className="journey-strip__grid">
            <article className="journey-card">
              <span className="journey-card__step">01</span>
              <h3>Choose context first</h3>
              <p>Users select the organization and election before the interface asks them to take action.</p>
            </article>
            <article className="journey-card">
              <span className="journey-card__step">02</span>
              <h3>Read choices clearly</h3>
              <p>Each office is separated, candidates are easier to compare, and deadlines stay visible.</p>
            </article>
            <article className="journey-card">
              <span className="journey-card__step">03</span>
              <h3>Review in one place</h3>
              <p>A dedicated review panel keeps progress, pending offices, and selected candidates together.</p>
            </article>
            <article className="journey-card">
              <span className="journey-card__step">04</span>
              <h3>Manage with less clutter</h3>
              <p>Admins get a more organized lifecycle view for setup, voting, results, and audit activity.</p>
            </article>
          </div>
        </section>

        <section className="auth-layout">
          <div id="access">
            <AuthCard onAuthenticated={handleAuthenticated} />
          </div>

          <section className="panel roadmap-panel" id="capabilities">
            <p className="landing-section-title">Role-based entry</p>
            <h2>Designed for both election managers and voters</h2>
            <ul className="feature-list">
              <li>Register and sign in with secured JWT sessions.</li>
              <li>Create or switch organizations without losing context.</li>
              <li>Manage elections through clearer lifecycle stages instead of scattered tools.</li>
              <li>Cast ballots through candidate cards and a review-first submission flow.</li>
            </ul>

            <div className="vision-grid">
              <article className="vision-card">
                <span className="vision-card__label">Managers</span>
                <strong>See the next action, monitor readiness, and manage election status with less noise.</strong>
              </article>
              <article className="vision-card">
                <span className="vision-card__label">Voters</span>
                <strong>Access open ballots, review each office clearly, and confirm submission with confidence.</strong>
              </article>
              <article className="vision-card">
                <span className="vision-card__label">Platform</span>
                <strong>Keep frontend, API, and data flow aligned around a realistic election journey.</strong>
              </article>
            </div>
          </section>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
