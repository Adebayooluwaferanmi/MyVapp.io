import { describe, expect, it } from "vitest";

import { slugify } from "./slug";

describe("slugify", () => {
  it("normalizes names into URL-safe slugs", () => {
    expect(slugify("Student Union Election 2026")).toBe("student-union-election-2026");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  *** Welfare Officer ***  ")).toBe("welfare-officer");
  });
});
