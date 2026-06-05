import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("deployment runtime safety", () => {
  it("keeps guest-session signing edge-safe for the proxy runtime", () => {
    const proxy = readFileSync(join(root, "proxy.ts"), "utf8");
    const guestSession = readFileSync(join(root, "lib", "guest-session.ts"), "utf8");
    const deploymentHealthRoute = readFileSync(
      join(root, "app", "api", "deployment-health", "route.ts"),
      "utf8",
    );

    expect(proxy).toMatch(/try\s*{/);
    expect(proxy).toMatch(/guest session cookie setup failed/);
    expect(proxy).toMatch(/api\/ai\/provider-health/);
    expect(proxy).toMatch(/api\/deployment-health/);
    expect(guestSession).toMatch(/globalThis\.crypto\?\.subtle/);
    expect(guestSession).not.toMatch(/node:crypto/);
    expect(guestSession).not.toMatch(/Buffer\.from/);
    expect(deploymentHealthRoute).toMatch(/export const runtime = "nodejs"/);
    expect(deploymentHealthRoute).toMatch(/VERCEL_GIT_COMMIT_SHA/);
    expect(deploymentHealthRoute).toMatch(/databaseConfigured/);
    expect(deploymentHealthRoute).toMatch(/databaseReachable/);
    expect(deploymentHealthRoute).toMatch(/databaseErrorClass/);
    expect(deploymentHealthRoute).toMatch(/checkDatabaseReachability/);
    expect(deploymentHealthRoute).toMatch(/guestSecretConfigured/);
    expect(deploymentHealthRoute).toMatch(/providerHealthPath/);
    expect(deploymentHealthRoute).not.toMatch(/@\/lib\/api-security/);
    expect(deploymentHealthRoute).not.toMatch(/@\/lib\/db/);
    expect(deploymentHealthRoute).not.toMatch(/@\/lib\/gemini/);
  });
});
