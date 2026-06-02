import type { StoredPaper } from "@/types";

export type GuestPaperSnapshot = Pick<
  StoredPaper,
  | "id"
  | "title"
  | "config"
  | "blueprint"
  | "questions"
  | "isDemoMode"
  | "status"
  | "createdAt"
  | "manifest"
  | "generationJobId"
  | "idempotencyKey"
>;

export function toGuestPaperSnapshot(paper: StoredPaper): GuestPaperSnapshot {
  return {
    id: paper.id,
    title: paper.title,
    config: paper.config,
    blueprint: paper.blueprint,
    questions: paper.questions,
    isDemoMode: paper.isDemoMode,
    status: paper.status,
    createdAt: paper.createdAt,
    manifest: paper.manifest,
    generationJobId:
      typeof paper.generationJobId === "string" ? paper.generationJobId : null,
    idempotencyKey:
      typeof paper.idempotencyKey === "string" ? paper.idempotencyKey : null,
  };
}

export async function signGuestPaperSnapshot(
  paper: StoredPaper,
  ownerId: number,
) {
  return signSnapshotPayload(toGuestPaperSnapshot(paper), ownerId);
}

export async function verifyGuestPaperSnapshot(
  snapshot: unknown,
  token: string | undefined,
  ownerId: number,
  expectedPaperId: number,
) {
  const normalized = normalizeGuestPaperSnapshot(snapshot);
  if (!normalized || !token) return null;
  if (normalized.id !== expectedPaperId) return null;
  if (normalized.status !== "READY") return null;

  const expected = await signSnapshotPayload(normalized, ownerId);
  return timingSafeEqual(token, expected) ? normalized : null;
}

function normalizeGuestPaperSnapshot(value: unknown): GuestPaperSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredPaper>;
  if (!Number.isInteger(record.id) || Number(record.id) <= 0) return null;
  if (!record.config || !record.blueprint || !Array.isArray(record.questions)) {
    return null;
  }
  if (!record.questions.length || record.questions.length > 150) return null;

  return {
    id: Number(record.id),
    title: typeof record.title === "string" ? record.title : "Guest Paper",
    config: record.config,
    blueprint: record.blueprint,
    questions: record.questions,
    isDemoMode: Boolean(record.isDemoMode),
    status: record.status === "READY" ? "READY" : "GENERATING",
    createdAt:
      typeof record.createdAt === "string"
        ? record.createdAt
        : new Date().toISOString(),
    manifest: record.manifest,
    generationJobId:
      typeof record.generationJobId === "string" ? record.generationJobId : null,
    idempotencyKey:
      typeof record.idempotencyKey === "string" ? record.idempotencyKey : null,
  };
}

async function signSnapshotPayload(snapshot: GuestPaperSnapshot, ownerId: number) {
  const payload = stableStringify({
    ownerId,
    snapshot,
  });
  const bytes = await hmacSha256(payload);
  return base64UrlEncode(bytes);
}

async function hmacSha256(message: string) {
  const secret =
    process.env.EDUTEST_GUEST_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "edutest-local-guest-session-secret";
  const encoder = new TextEncoder();
  if (globalThis.crypto?.subtle) {
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await globalThis.crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(message),
    );
    return new Uint8Array(signature);
  }

  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(message).digest();
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();

  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function base64UrlEncode(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function timingSafeEqual(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}
