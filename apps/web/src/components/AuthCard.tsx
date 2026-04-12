import type { FormEvent } from "react";
import { useState } from "react";

import { login, register } from "../lib/services";
import type { AuthResponse } from "../types";

type AuthMode = "login" | "register";

type AuthCardProps = {
  onAuthenticated: (payload: AuthResponse) => void;
};

const initialRegisterState = {
  firstName: "",
  lastName: "",
  email: "",
  password: ""
};

const initialLoginState = {
  email: "",
  password: ""
};

export function AuthCard({ onAuthenticated }: AuthCardProps) {
  const [mode, setMode] = useState<AuthMode>("register");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [registerForm, setRegisterForm] = useState(initialRegisterState);
  const [loginForm, setLoginForm] = useState(initialLoginState);

  const subtitle =
    mode === "register"
      ? "Create your first admin or voter account to initialize the workspace."
      : "Sign in to continue managing organizations, elections, offices, and ballots.";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const payload =
        mode === "register"
          ? await register(registerForm)
          : await login(loginForm);

      onAuthenticated(payload);
      setFeedback(payload.message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel auth-card">
      <div className="auth-toggle" aria-label="Authentication mode">
        <button
          className={mode === "register" ? "auth-toggle__button active" : "auth-toggle__button"}
          onClick={() => setMode("register")}
          type="button"
        >
          Register
        </button>
        <button
          className={mode === "login" ? "auth-toggle__button active" : "auth-toggle__button"}
          onClick={() => setMode("login")}
          type="button"
        >
          Login
        </button>
      </div>

      <h2>{mode === "register" ? "Start your voting workspace" : "Welcome back"}</h2>
      <p className="muted">{subtitle}</p>

      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === "register" ? (
          <>
            <label>
              First name
              <input
                required
                autoComplete="given-name"
                value={registerForm.firstName}
                onChange={(event) =>
                  setRegisterForm((current) => ({ ...current, firstName: event.target.value }))
                }
              />
            </label>
            <label>
              Last name
              <input
                required
                autoComplete="family-name"
                value={registerForm.lastName}
                onChange={(event) =>
                  setRegisterForm((current) => ({ ...current, lastName: event.target.value }))
                }
              />
            </label>
            <label>
              Email
              <input
                required
                type="email"
                autoComplete="email"
                value={registerForm.email}
                onChange={(event) =>
                  setRegisterForm((current) => ({ ...current, email: event.target.value }))
                }
              />
            </label>
            <label>
              Password
              <input
                required
                type="password"
                autoComplete="new-password"
                value={registerForm.password}
                onChange={(event) =>
                  setRegisterForm((current) => ({ ...current, password: event.target.value }))
                }
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Email
              <input
                required
                type="email"
                autoComplete="email"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, email: event.target.value }))
                }
              />
            </label>
            <label>
              Password
              <input
                required
                type="password"
                autoComplete="current-password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, password: event.target.value }))
                }
              />
            </label>
          </>
        )}

        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Please wait..." : mode === "register" ? "Create account" : "Sign in"}
        </button>
      </form>

      {feedback ? <p className="feedback">{feedback}</p> : null}
    </section>
  );
}
