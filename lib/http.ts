import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";

export class HttpError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export function ok<T extends object>(data?: T, status = 200) {
  return NextResponse.json({ ok: true, ...(data ?? {}) }, { status });
}

export function fail(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...(extra ?? {}) }, { status });
}

/** Blocks cross-site form posts. Browsers always send Origin on POST/PUT/PATCH/DELETE. */
function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    /* invalid origin header */
  }
  if (!host || originHost !== host) throw new HttpError(403, "This request was blocked for security reasons.");
}

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: same-origin check on writes and uniform JSON error responses. */
export function handle<P extends Record<string, string> = Record<string, string>>(
  fn: (req: NextRequest, ctx: Ctx<P>) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: Ctx<P>): Promise<Response> => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return fail(err.status, err.message, err.fields ? { fields: err.fields } : undefined);
      }
      console.error("[api]", req.method, req.nextUrl.pathname, err);
      if (
        err instanceof Prisma.PrismaClientKnownRequestError ||
        err instanceof Prisma.PrismaClientInitializationError
      ) {
        return fail(503, "The database is unavailable right now. Please try again in a moment.");
      }
      return fail(500, "Something went wrong on the server. Please try again.");
    }
  };
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, "The request body was not valid JSON.");
}

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown").slice(0, 45);
}

export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
