import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  sessionValue: null as unknown,
  sqlMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(() => mocks.sessionValue),
}));

vi.mock("@/lib/db", () => ({
  default: mocks.sqlMock,
}));

describe("API authentication helper", () => {
  beforeEach(() => {
    delete process.env.EDUTEST_AUTH_MODE;
    mocks.sessionValue = null;
    mocks.sqlMock.mockReset();
  });

  it("uses an ephemeral guest user without writing to the database by default", async () => {
    const { requireAuthenticatedUser } = await import("@/lib/api-security");
    const result = await requireAuthenticatedUser();

    expect(result.user?.id).toBeLessThan(0);
    expect(result.user?.email).toBe("guest@edutest.local");
    expect(result.user?.isGuest).toBe(true);
    expect(mocks.sqlMock).not.toHaveBeenCalled();
  }, 10_000);

  it("scopes guest users by anonymous session cookie", async () => {
    const { requireAuthenticatedUser } = await import("@/lib/api-security");
    const {
      createSignedGuestSessionCookieValue,
      guestSessionCookieName,
      guestSessionHeaderName,
    } = await import(
      "@/lib/guest-session"
    );
    const firstCookie = await createSignedGuestSessionCookieValue(
      "guest-session-aaaaaaaa",
    );
    const secondCookie = await createSignedGuestSessionCookieValue(
      "guest-session-bbbbbbbb",
    );
    const first = new Request("http://localhost/api/papers", {
      headers: {
        cookie: `${guestSessionCookieName}=${firstCookie}`,
      },
    });
    const second = new Request("http://localhost/api/papers", {
      headers: {
        cookie: `${guestSessionCookieName}=${secondCookie}`,
      },
    });

    const firstResult = await requireAuthenticatedUser(first);
    const secondResult = await requireAuthenticatedUser(second);

    expect(firstResult.user?.id).toBeLessThan(0);
    expect(secondResult.user?.id).toBeLessThan(0);
    expect(firstResult.user?.id).not.toBe(secondResult.user?.id);

    const headerResult = await requireAuthenticatedUser(
      new Request("http://localhost/api/papers", {
        headers: {
          [guestSessionHeaderName]: "guest-session-aaaaaaaa",
        },
      }),
    );
    expect(headerResult.response?.status).toBe(401);
  }, 10_000);

  it("returns 403 in NextAuth mode when the database user cannot be resolved", async () => {
    process.env.EDUTEST_AUTH_MODE = "nextauth";
    mocks.sessionValue = {
      user: {
        email: "Teacher@Example.com",
        name: "Teacher",
        image: null,
      },
    };
    mocks.sqlMock.mockResolvedValue([]);

    const { requireAuthenticatedUser } = await import("@/lib/api-security");
    const result = await requireAuthenticatedUser();

    expect(result.response?.status).toBe(403);
  }, 10_000);

  it("returns 401 in NextAuth mode without a signed-in user", async () => {
    process.env.EDUTEST_AUTH_MODE = "nextauth";
    mocks.sessionValue = null;

    const { requireAuthenticatedUser } = await import("@/lib/api-security");
    const result = await requireAuthenticatedUser();

    expect(result.response?.status).toBe(401);
    expect(mocks.sqlMock).not.toHaveBeenCalled();
  }, 10_000);

  it("returns 503 in NextAuth mode when the database is unavailable", async () => {
    process.env.EDUTEST_AUTH_MODE = "nextauth";
    mocks.sessionValue = {
      user: {
        email: "Teacher@Example.com",
        name: "Teacher",
        image: null,
      },
    };
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      default: null,
    }));

    const { requireAuthenticatedUser } = await import("@/lib/api-security");
    const result = await requireAuthenticatedUser();

    expect(result.response?.status).toBe(503);
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({
      default: mocks.sqlMock,
    }));
  }, 10_000);

  it("resolves the database user by session email", async () => {
    process.env.EDUTEST_AUTH_MODE = "nextauth";
    mocks.sessionValue = {
      user: {
        email: "Teacher@Example.com",
        name: "Teacher",
        image: null,
      },
    };
    mocks.sqlMock.mockResolvedValue([
      { id: 12, email: "teacher@example.com", name: "Teacher", image: null },
    ]);

    const { requireAuthenticatedUser } = await import("@/lib/api-security");
    const result = await requireAuthenticatedUser();

    expect(result.user?.id).toBe(12);
    expect(result.user?.email).toBe("teacher@example.com");
  }, 10_000);

  it("returns actionable schema validation messages", async () => {
    const { parseJsonWithSchema } = await import("@/lib/api-security");
    const request = new NextRequest("http://localhost/api/generate-paper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalQuestions: 2,
        bloomDistribution: { REMEMBER: 40, UNDERSTAND: 40 },
      }),
    });

    const result = await parseJsonWithSchema(
      request,
      z.object({
        totalQuestions: z.number().min(5),
        bloomDistribution: z
          .object({
            REMEMBER: z.number(),
            UNDERSTAND: z.number(),
          })
          .refine(
            (value) => value.REMEMBER + value.UNDERSTAND === 100,
            "Bloom distribution must add up to 100.",
          ),
      }),
    );

    expect(result.response?.status).toBe(400);
    const payload = await result.response?.json();
    expect(payload.error).toContain("Invalid request payload:");
    expect(payload.error).toContain("Total questions");
    expect(payload.error).toContain("Bloom distribution");
    expect(payload.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "totalQuestions" }),
        expect.objectContaining({ path: "bloomDistribution" }),
      ]),
    );
  }, 10_000);

  it("returns rate limit messages with limit and retry timing", async () => {
    const { rateLimit } = await import("@/lib/api-security");
    const request = new NextRequest("http://localhost/api/evaluate-answers");
    const key = `test-rate:${Date.now()}:${Math.random()}`;

    expect(
      rateLimit(request, key, 1, 60_000, { action: "evaluation requests" }),
    ).toBeNull();
    const response = rateLimit(request, key, 1, 60_000, {
      action: "evaluation requests",
    });

    expect(response?.status).toBe(429);
    const payload = await response?.json();
    expect(payload.error).toContain("Too many evaluation requests");
    expect(payload.error).toContain("Limit is 1 per 1 minute");
    expect(payload.details).toMatchObject({
      action: "evaluation requests",
      limit: 1,
      retryAfterSeconds: expect.any(Number),
      windowMs: 60_000,
      storage: "process-local",
    });
  }, 10_000);
});
