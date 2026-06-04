import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { authOptions } from "@/lib/auth";
import sql from "@/lib/db";
import {
  defaultGuestSessionId,
  guestSessionCookieName,
  guestUserIdFromSession,
  readSignedGuestSessionCookieValue,
} from "@/lib/guest-session";

export interface AuthenticatedUser {
  id: number;
  email: string;
  name?: string | null;
  image?: string | null;
  guestSessionId?: string;
  isGuest?: boolean;
}

type AuthenticatedUserResult =
  | { user: AuthenticatedUser; response?: never }
  | { response: NextResponse; user?: never };

export const guestUser = createGuestUser(defaultGuestSessionId);

type RateBucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  action?: string;
};

export function authMode() {
  return "guest" as const;
}

const globalForRateLimit = globalThis as typeof globalThis & {
  __edutestRateLimit?: Map<string, RateBucket>;
  __edutestRateLimitLastPruneAt?: number;
};

const rateBuckets =
  globalForRateLimit.__edutestRateLimit ?? new Map<string, RateBucket>();
globalForRateLimit.__edutestRateLimit = rateBuckets;

export function jsonError(
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json(
    {
      success: false,
      error: message,
      code: status,
      details,
    },
    { status },
  );
}

export function jsonSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    init,
  );
}

export async function requireAuthenticatedUser(
  request?: Request,
): Promise<AuthenticatedUserResult> {
  if (authMode() === "guest") {
    const sessionId = await resolveGuestSessionId(request);
    if (!sessionId) {
      return {
        response: jsonError(
          "Guest session is missing or invalid. Reload the app and try again.",
          401,
          { code: "GUEST_SESSION_REQUIRED" },
        ),
      };
    }
    return { user: createGuestUser(sessionId) };
  }

  const session = await getServerSession(authOptions);
  const sessionUser = session?.user;
  const email = sessionUser?.email?.trim().toLowerCase();
  const name = sessionUser?.name ?? "Guest User";
  const image = sessionUser?.image ?? null;

  if (!email) return { response: jsonError("Authentication is required.", 401) };
  if (!sql) {
    return {
      response: jsonError(
        "Database is required when EDUTEST_AUTH_MODE is nextauth.",
        503,
      ),
    };
  }

  const rows = await sql`
    INSERT INTO users (email, name, image)
    VALUES (${email}, ${name}, ${image})
    ON CONFLICT (email) DO UPDATE
    SET
      name = COALESCE(EXCLUDED.name, users.name),
      image = COALESCE(EXCLUDED.image, users.image)
    RETURNING id, email, name, image
  `;

  const row = rows[0];
  if (!row) {
    return { response: jsonError("Authenticated user could not be resolved.", 403) };
  }

  return {
    user: {
      id: Number(row.id),
      email: String(row.email),
      name: row.name,
      image: row.image,
    } satisfies AuthenticatedUser,
  };
}

export function createGuestUser(sessionId = defaultGuestSessionId): AuthenticatedUser {
  return {
    id: guestUserIdFromSession(sessionId),
    email: "guest@edutest.local",
    name: "Guest",
    image: null,
    guestSessionId: sessionId,
    isGuest: true,
  };
}

export function isGuestUserId(userId: number | null | undefined) {
  return typeof userId === "number" && userId < 0;
}

export function requireAdminUser(user: AuthenticatedUser) {
  const adminEmails = new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!adminEmails.has(user.email.toLowerCase())) {
    return jsonError("Admin access is required for this operation.", 403);
  }

  return null;
}

export function rateLimit(
  request: NextRequest,
  key: string,
  limit: number,
  windowMs: number,
  options: RateLimitOptions = {},
) {
  const now = Date.now();
  pruneExpiredRateBuckets(now);
  const bucketKey = key;
  const bucket = rateBuckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (bucket.count >= limit) {
    const retryAfterMs = bucket.resetAt - now;
    return jsonError(
      rateLimitMessage({
        action: options.action,
        limit,
        retryAfterMs,
        windowMs,
      }),
      429,
      {
        action: options.action ?? "requests",
        limit,
        retryAfterMs,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
        windowMs,
        storage: "process-local",
      },
    );
  }

  bucket.count += 1;
  return null;
}

function pruneExpiredRateBuckets(now: number) {
  const lastPruneAt = globalForRateLimit.__edutestRateLimitLastPruneAt ?? 0;
  if (rateBuckets.size < 1000 && now - lastPruneAt < 60_000) return;

  for (const [key, bucket] of Array.from(rateBuckets.entries())) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }

  globalForRateLimit.__edutestRateLimitLastPruneAt = now;
}

async function resolveGuestSessionId(request?: Request) {
  if (!request) return defaultGuestSessionId;
  const cookieHeader = request?.headers.get("cookie") ?? "";
  const cookieValue = readCookie(cookieHeader, guestSessionCookieName);
  return readSignedGuestSessionCookieValue(cookieValue);
}

function readCookie(cookieHeader: string, name: string) {
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!match) return null;

  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return match.slice(name.length + 1);
  }
}

export async function parseJsonWithSchema<T>(
  request: NextRequest,
  schema: ZodSchema<T>,
) {
  try {
    const body = await request.json();
    return { data: schema.parse(body) };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        response: jsonError(formatZodErrorMessage(error), 400, {
          ...error.flatten(),
          issues: error.issues.map((issue) => ({
            path: issue.path.join(".") || "request",
            message: issue.message,
          })),
        }),
      };
    }

    return { response: jsonError("Invalid JSON request body.", 400) };
  }
}

export function parseIdParam(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function formatZodErrorMessage(error: ZodError) {
  const issues = error.issues
    .map((issue) => ({
      path: issue.path.join(".") || "request",
      message: issue.message,
    }))
    .slice(0, 4);

  if (!issues.length) return "Invalid request payload.";

  return `Invalid request payload: ${issues
    .map((issue) => `${humanizePath(issue.path)} - ${issue.message}`)
    .join("; ")}.`;
}

function humanizePath(path: string) {
  const labels: Record<string, string> = {
    pdfSourceId: "Uploaded PDF",
    generationMode: "Generation mode",
    integrationPrompt: "Integration prompt",
    typeDistribution: "Question counts",
    questionComposition: "S/C/T composition",
    bloomDistribution: "Bloom distribution",
    totalMarks: "Total marks",
    totalQuestions: "Total questions",
    chapterIds: "Chapters",
    subjectSelections: "Subject selections",
    answers: "Answers",
    paperId: "Paper",
  };

  const root = path.split(".")[0] ?? path;
  return labels[root] ?? path;
}

function rateLimitMessage({
  action,
  limit,
  retryAfterMs,
  windowMs,
}: {
  action?: string;
  limit: number;
  retryAfterMs: number;
  windowMs: number;
}) {
  const label = action ?? "requests";
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return `Too many ${label}. Limit is ${limit} per ${formatWindow(windowMs)}. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
}

function formatWindow(windowMs: number) {
  if (windowMs % 3_600_000 === 0) {
    const hours = windowMs / 3_600_000;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  if (windowMs % 60_000 === 0) {
    const minutes = windowMs / 60_000;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const seconds = Math.ceil(windowMs / 1000);
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}
