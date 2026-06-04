import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("deployment runtime safety", () => {
  it("keeps guest-session signing edge-safe for the proxy runtime", () => {
    const proxy = readFileSync(join(root, "proxy.ts"), "utf8");
    const guestSession = readFileSync(join(root, "lib", "guest-session.ts"), "utf8");

    expect(proxy).toMatch(/try\s*{/);
    expect(proxy).toMatch(/guest session cookie setup failed/);
    expect(guestSession).toMatch(/globalThis\.crypto\?\.subtle/);
    expect(guestSession).not.toMatch(/node:crypto/);
    expect(guestSession).not.toMatch(/Buffer\.from/);
  });
});
