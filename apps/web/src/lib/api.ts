export const apiBaseUrl =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000/api/v1";

type RequestOptions = RequestInit & {
  token?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers
  });

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
