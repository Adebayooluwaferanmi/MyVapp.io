import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppThemeProvider, useAppTheme } from "./theme";

function ThemeProbe() {
  const { setTheme } = useAppTheme();

  return (
    <button
      onClick={() =>
        setTheme({
          themePreset: "emerald-hall",
          themeOverrides: {
            primary: "#123456",
            accent: "#654321"
          }
        })
      }
      type="button"
    >
      Switch theme
    </button>
  );
}

describe("AppThemeProvider", () => {
  it("applies preset tokens and accepts runtime overrides", () => {
    const { container } = render(
      <AppThemeProvider>
        <ThemeProbe />
      </AppThemeProvider>
    );

    const host = container.firstElementChild as HTMLElement;

    expect(host.style.getPropertyValue("--background")).toBe("#f4f7fb");
    expect(host.style.getPropertyValue("--primary")).toBe("#2563eb");

    fireEvent.click(screen.getByRole("button", { name: "Switch theme" }));

    expect(host.style.getPropertyValue("--background")).toBe("#f3faf7");
    expect(host.style.getPropertyValue("--primary")).toBe("#123456");
    expect(host.style.getPropertyValue("--accent")).toBe("#654321");
  });
});
