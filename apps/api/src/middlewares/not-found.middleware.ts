import type { Request, Response } from "express";

export function notFoundMiddleware(request: Request, response: Response): void {
  response.status(404).json({
    message: `Route ${request.method} ${request.originalUrl} was not found.`
  });
}
