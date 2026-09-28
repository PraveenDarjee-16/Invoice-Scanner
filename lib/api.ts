/** Browser helper for calling this app's own JSON API with useful error messages. */
export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export async function apiFetch<T = Record<string, unknown>>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", ...init });
  } catch {
    throw new ApiError("No connection to the server. Check your network and try again.", 0);
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || !data || data.ok === false) {
    const message =
      (data && typeof data.error === "string" && data.error) ||
      (res.status === 413 ? "That upload is too large for the server." : "The server sent an unexpected response. Please try again.");
    throw new ApiError(message, res.status, (data?.fields as Record<string, string> | undefined) ?? undefined);
  }
  return data as T;
}

export const postJson = <T = Record<string, unknown>>(url: string, body: unknown, method = "POST") =>
  apiFetch<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
