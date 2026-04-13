import type { FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { login, register } from "@/lib/services";
import type { AuthResponse } from "@/types";

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
      ? "Create an account to start using MyVapp."
      : "Sign in to manage elections or cast your ballot.";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const payload = mode === "register" ? await register(registerForm) : await login(loginForm);

      onAuthenticated(payload);
      setFeedback(payload.message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="border-white/80 bg-white/95 shadow-[0_24px_70px_-32px_rgba(15,23,42,0.45)]">
      <CardHeader className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="outline">Sign in</Badge>
          <div className="rounded-full bg-[color:var(--secondary)] p-3 text-[color:var(--primary)]">
            <ShieldCheck className="size-5" />
          </div>
        </div>
        <div className="space-y-2">
          <CardTitle>{mode === "register" ? "Create your account" : "Welcome back"}</CardTitle>
          <p className="text-sm text-[color:var(--muted-foreground)]">{subtitle}</p>
        </div>
        <div className="grid grid-cols-2 rounded-full bg-[color:var(--muted)] p-1">
          <button
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              mode === "register"
                ? "bg-white text-[color:var(--foreground)] shadow-sm"
                : "text-[color:var(--muted-foreground)]"
            )}
            onClick={() => setMode("register")}
            type="button"
          >
            Register
          </button>
          <button
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              mode === "login"
                ? "bg-white text-[color:var(--foreground)] shadow-sm"
                : "text-[color:var(--muted-foreground)]"
            )}
            onClick={() => setMode("login")}
            type="button"
          >
            Login
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <>
              <label className="grid gap-2 text-sm font-medium">
                <span>First name</span>
                <Input
                  required
                  autoComplete="given-name"
                  value={registerForm.firstName}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, firstName: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                <span>Last name</span>
                <Input
                  required
                  autoComplete="family-name"
                  value={registerForm.lastName}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, lastName: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                <span>Email</span>
                <Input
                  required
                  type="email"
                  autoComplete="email"
                  value={registerForm.email}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                <span>Password</span>
                <Input
                  required
                  type="password"
                  autoComplete="new-password"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
            </>
          ) : (
            <>
              <label className="grid gap-2 text-sm font-medium">
                <span>Email</span>
                <Input
                  required
                  type="email"
                  autoComplete="email"
                  value={loginForm.email}
                  onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                <span>Password</span>
                <Input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={loginForm.password}
                  onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                />
              </label>
            </>
          )}

          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Please wait..." : mode === "register" ? "Create account" : "Sign in"}
          </Button>
        </form>

        {feedback ? (
          <Alert variant="success">
            <AlertTitle>Authentication</AlertTitle>
            <AlertDescription>{feedback}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
