import type { Request, Response } from "express";

import { loginSchema, registerSchema } from "./auth.schemas";
import { getCurrentUser, loginUser, registerUser } from "./auth.service";

export async function register(request: Request, response: Response): Promise<void> {
  const payload = registerSchema.parse(request.body);
  const result = await registerUser(payload);

  response.status(201).json({
    message: "Registration successful.",
    ...result
  });
}

export async function login(request: Request, response: Response): Promise<void> {
  const payload = loginSchema.parse(request.body);
  const result = await loginUser(payload);

  response.status(200).json({
    message: "Login successful.",
    ...result
  });
}

export async function me(request: Request, response: Response): Promise<void> {
  const user = await getCurrentUser(request.user!.sub);

  response.status(200).json({
    user
  });
}
