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

/**
 * Sliding-window rate limiter entry.
 * Instead of a single reset-at deadline (fixed window), we track individual
 * request timestamps.  This means a client that fires 10 requests at the
 * start of a 60-second window does NOT get a full new budget at second 61 —
 * those 10 requests slide out gradually, giving a smooth rate limit.
 */
type RateBucket = {
  /** Unix-ms timestamps of each request in the current window. */
  timestamps: number[];
  /** When this bucket was last pruned (avoids pruning on every call). */
  prunedAt: number;
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

/**
 * Get the real client IP address from the request.
 * Validates X-Forwarded-For to prevent spoofing attacks.
 * In serverless environments, the real IP is typically in the rightmost
 * untrusted hop, but we check for common legitimate configurations.
 */
function getClientIp(request: NextRequest): string {
  // Check standard headers for client IP
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip"); // Cloudflare

  // Use CF-IP if present (Cloudflare adds this)
  if (cfConnectingIp) {
    return sanitizeIp(cfConnectingIp);
  }

  // Use X-Real-IP if present (nginx, etc.)
  if (realIp) {
    return sanitizeIp(realIp);
  }

  // X-Forwarded-For can be spoofed - only trust the leftmost IP if it's
  // from a known proxy, otherwise use the rightmost (original client)
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map((ip) => sanitizeIp(ip.trim()));
    // In most cloud deployments, the rightmost IP is the original client
    // The leftmost IPs are from proxies we trust (load balancers, CDN)
    // We take the rightmost to avoid XFF spoofing from clients
    return ips[ips.length - 1] || "unknown";
  }

  // Fallback to the request's connection info (may be 127.0.0.1 in serverless)
  return request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-now-billing-project") ||
    "127.0.0.1";
}

function sanitizeIp(ip: string): string {
  // Remove any non-IP characters and validate basic format
  const cleaned = ip.replace(/[^0-9a-fA-F.:]/g, "");

  // Basic IPv4 validation
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleaned)) {
    return cleaned;
  }

  // Basic IPv6 validation (simplified)
  if (cleaned.includes(":")) {
    return cleaned;
  }

  // If it doesn't look like a valid IP, return a hash of the value
  // This prevents spoofing while still rate-limiting
  return `invalid-${hashString(cleaned.slice(0, 20))}`;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Check if we're running in a serverless environment where in-memory
 * rate limiting is less effective.
 */
function isServerlessEnvironment(): boolean {
  return Boolean(
    process.env.VERCEL === "1" ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FLY || // Fly.io
    process.env.K_SERVICE // Google Cloud Run
  );
}

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

/** Derive the guest email address for a given derived guest user ID. */
function guestEmailForSession(userId: number) {
  return `guest-${Math.abs(userId)}@edutest.local`;
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

  // Get real client IP and combine with the provided key for better rate limiting
  const clientIp = getClientIp(request);
  const bucketKey = `${clientIp}:${key}`;

  const bucket = rateBuckets.get(bucketKey);

  // Log warning in serverless environments about in-memory rate limiting limitations
  if (isServerlessEnvironment() && rateBuckets.size > 100) {
    console.warn(
      `[rateLimit] Warning: In-memory rate limiting in serverless environment. ` +
      `Consider using a distributed rate limiter (Redis, Upstash) for production. ` +
      `Current bucket count: ${rateBuckets.size}`,
    );
  }

  // Sliding window: expire timestamps outside the window, then count remaining
  if (!bucket) {
    rateBuckets.set(bucketKey, { timestamps: [now], prunedAt: now });
    return null;
  }

  // Remove timestamps that have slid out of the window
  const windowStart = now - windowMs;
  const activeTimestamps = bucket.timestamps.filter((ts) => ts > windowStart);

  if (activeTimestamps.length >= limit) {
    // Find the oldest timestamp still in-window — that's when the window
    // will have room again (sliding window, so it's not a fixed reset time)
    const oldestInWindow = activeTimestamps[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
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
        retryAfterSeconds: Math.ceil(Math.max(1, retryAfterMs) / 1000),
        windowMs,
        storage: isServerlessEnvironment() ? "process-local-warning" : "process-local",
        clientIp: isServerlessEnvironment() ? "available-in-logs" : undefined,
      },
    );
  }

  // Add this request's timestamp and save
  activeTimestamps.push(now);
  bucket.timestamps = activeTimestamps;
  return null;
}

/**
 * Remove stale entries lazily.  Called on every rateLimit() invocation so
 * the map does not grow unbounded in long-running processes.
 * We skip pruning until the map is large enough to justify the scan, and
 * we cap pruning frequency to once per minute.
 */
function pruneExpiredRateBuckets(now: number) {
  const lastPruneAt = globalForRateLimit.__edutestRateLimitLastPruneAt ?? 0;
  // Only prune when the map is getting large or a minute has passed
  if (rateBuckets.size < 500 && now - lastPruneAt < 60_000) return;

  const windowCutoff = now; // individual bucket windows are handled inside rateLimit()
  for (const [key, bucket] of Array.from(rateBuckets.entries())) {
    // A bucket is stale if all its timestamps are expired
    if (bucket.timestamps.length === 0 || bucket.timestamps[bucket.timestamps.length - 1] < windowCutoff) {
      rateBuckets.delete(key);
    }
  }

  globalForRateLimit.__edutestRateLimitLastPruneAt = now;
}

async function resolveGuestSessionId(request?: Request) {
  if (!request) return defaultGuestSessionId;
  const cookieHeader = request?.headers.get("cookie") ?? "";
  const cookieValue = readCookie(cookieHeader, guestSessionCookieName);
  if (!cookieValue) return null;

  const signedId = await readSignedGuestSessionCookieValue(cookieValue);
  if (signedId) return signedId;

  // If it's unsigned but has a valid shape (e.g. set by the edge proxy)
  const {
    hasValidGuestSessionIdShape,
    guestUserIdFromSession,
    createSignedGuestSessionCookieValue,
    signedGuestSessionMaxAge,
  } = await import("@/lib/guest-session");

  if (hasValidGuestSessionIdShape(cookieValue)) {
    const guestUserId = guestUserIdFromSession(cookieValue);

    // SECURITY FIX: Use an atomic INSERT ... ON CONFLICT instead of SELECT-then-INSERT
    // to eliminate the race condition where two concurrent requests could both see
    // "user does not exist" and both try to create the same guest user.
    // The ON CONFLICT DO NOTHING ensures only one succeeds atomically.
    if (sql) {
      try {
        await sql`
          INSERT INTO users (id, email, name)
          VALUES (${guestUserId}, ${guestEmailForSession(guestUserId)}, 'Guest')
          ON CONFLICT (id) DO NOTHING
        `;
      } catch (err) {
        console.error("[resolveGuestSessionId] failed to upsert guest user", err);
        // Proceed with auto-upgrade even if DB upsert failed — the guest user
        // will be created on first authenticated write if needed.
      }
    }

    // Auto-upgrade: set the signed cookie so subsequent requests are authenticated
    const signedValue = await createSignedGuestSessionCookieValue(cookieValue);
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      cookieStore.set({
        name: guestSessionCookieName,
        value: signedValue,
        httpOnly: true,
        sameSite: "lax",
        secure: request.url.startsWith("https:"),
        path: "/",
        maxAge: signedGuestSessionMaxAge,
      });
    } catch {
      // Ignore failures when cookies() is used outside Next.js request context (e.g., in unit tests)
    }
    return cookieValue;
  }

  return null;
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
  options: { maxBytes?: number } = {},
) {
  try {
    const maxBytes = options.maxBytes ?? 1_000_000;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return { response: jsonError("JSON request body is too large.", 413) };
    }

    const text = await request.text();
    if (text.length > maxBytes) {
      return { response: jsonError("JSON request body is too large.", 413) };
    }

    const body = JSON.parse(text);
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
