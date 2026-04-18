import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "./App";
import { AppThemeProvider } from "./lib/theme";

vi.mock("./lib/services", () => ({
  getHealthStatus: vi.fn().mockResolvedValue({ status: "ok", service: "myvapp-api" }),
  getCurrentUser: vi.fn()
}));

describe("App landing page", () => {
  it("emphasizes the manager setup path while keeping voter access visible", async () => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");

    render(
      <AppThemeProvider>
        <App />
      </AppThemeProvider>
    );

    expect(
      screen.getByRole("heading", {
        name: /set up and run elections without turning the process into admin overhead/i
      })
    ).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: /managers start here/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /a direct path in, not a maze/i })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /set up and run an election/i })
    ).toBeInTheDocument();
  });
});
