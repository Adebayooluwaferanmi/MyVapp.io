export const apiBaseUrl =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "/api/v1";

type RequestOptions = RequestInit & {
  token?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? "Cannot reach the API right now. Make sure the backend is running and try again."
        : "Cannot reach the API right now.";

    throw new Error(message);
  }

  const responseText = await response.text();
  let payload = {} as T & { message?: string };

  if (responseText) {
    try {
      payload = JSON.parse(responseText) as T & { message?: string };
    } catch {
      payload = { message: responseText } as T & { message?: string };
    }
  }

  if (!response.ok) {
    const message = payload.message ?? "Request failed.";
    throw new Error(message);
  }

  return payload;
}
