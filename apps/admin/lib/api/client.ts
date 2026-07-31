import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-only client for apps/api. Every call runs inside a Server Component
 * or Server Action (never the browser), so this attaches the current
 * Supabase session's access token as a Bearer header and talks to `API_URL`
 * directly — no CORS involved, because the browser never sees this request.
 */
async function authorizedFetch(path: string, init?: RequestInit) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    // The (dashboard) layout already redirects unauthenticated users to
    // /login before any page/action can reach here — this only fires if a
    // session expires mid-request.
    throw new Error("No active session");
  }

  return fetch(`${process.env.API_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(", ");
    if (body.message) return body.message;
  } catch {
    // Non-JSON error body — fall through to the generic message.
  }
  return `Request failed (${res.status})`;
}

/**
 * For reads in Server Components. 404 maps to Next's notFound() boundary;
 * any other failure throws, caught by the nearest error.tsx.
 */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await authorizedFetch(path);

  if (res.status === 404) {
    notFound();
  }
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }

  // NestJS sends an empty body (not the literal "null") when a handler
  // returns null, e.g. GET /leads/:id/conversation for a lead with no
  // linked conversation — res.json() would throw on that empty body.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * For writes in Server Actions. Never throws on an HTTP error — returns a
 * result the action can hand back to the form for inline display instead of
 * crashing to the nearest error boundary.
 */
export async function apiMutate<T>(
  path: string,
  init: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const res = await authorizedFetch(path, init);

  if (!res.ok) {
    return { ok: false, error: await parseErrorMessage(res) };
  }

  return { ok: true, data: (await res.json()) as T };
}
