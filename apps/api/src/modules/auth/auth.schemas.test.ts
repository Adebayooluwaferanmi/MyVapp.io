import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema } from "./auth.schemas";

describe("auth schemas", () => {
  it("accepts a valid registration payload", () => {
    const payload = registerSchema.parse({
      firstName: "Ada",
      lastName: "Okafor",
      email: "ada@example.com",
      password: "SecurePass1"
    });

    expect(payload.email).toBe("ada@example.com");
  });

  it("rejects a weak registration password", () => {
    const result = registerSchema.safeParse({
      firstName: "Ada",
      lastName: "Okafor",
      email: "ada@example.com",
      password: "password"
    });

    expect(result.success).toBe(false);
  });

  it("accepts a valid login payload", () => {
    const payload = loginSchema.parse({
      email: "ada@example.com",
      password: "SecurePass1"
    });

    expect(payload.email).toBe("ada@example.com");
  });
});
