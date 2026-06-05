import type { StoredPaper } from "@/types";
import { guestSigningSecret } from "@/lib/guest-secret";

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
  expectedPaperId: number | string,
) {
  if (!isValidSnapshotToken(token)) return null;
  const normalized = normalizeGuestPaperSnapshot(snapshot);
  if (!normalized) return null;
  if (String(normalized.id) !== String(expectedPaperId)) return null;
  if (normalized.status !== "READY") return null;

  const expected = await signSnapshotPayload(normalized, ownerId);
  return timingSafeEqual(token, expected) ? normalized : null;
}

function normalizeGuestPaperSnapshot(value: unknown): GuestPaperSnapshot | null {
  if (!value || typeof value !== "object") return null;
  if (!isBoundedSnapshotValue(value)) return null;
  const record = value as Partial<StoredPaper>;
  const id = normalizePaperSnapshotId(record.id);
  if (!id) return null;
  if (!record.config || !record.blueprint || !Array.isArray(record.questions)) {
    return null;
  }
  if (!record.questions.length || record.questions.length > 150) return null;
  if (!isBoundedSnapshotValue(record.config) || !isBoundedSnapshotValue(record.blueprint)) {
    return null;
  }

  return {
    id,
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

function normalizePaperSnapshotId(value: unknown): number | string | null {
  if (Number.isInteger(value) && Number(value) > 0) return Number(value);
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (/^[1-9]\d{0,9}$/.test(trimmed)) return Number(trimmed);
  if (/^session-\d{10,17}-[a-z0-9]{8,32}$/i.test(trimmed)) return trimmed;
  return null;
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
  const secret = guestSigningSecret();
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

function isValidSnapshotToken(value: string | undefined): value is string {
  return typeof value === "string" && value.length >= 32 && value.length <= 256;
}

function isBoundedSnapshotValue(value: unknown) {
  let nodes = 0;
  let estimatedChars = 0;

  const visit = (item: unknown, depth: number, ancestors: Set<object>): boolean => {
    nodes += 1;
    if (nodes > 8_000 || depth > 10) return false;

    if (item === null || item === undefined) {
      estimatedChars += 4;
      return estimatedChars <= 300_000;
    }

    if (typeof item === "string") {
      if (item.length > 20_000) return false;
      estimatedChars += item.length;
    } else if (typeof item === "number" || typeof item === "boolean") {
      estimatedChars += 16;
    } else if (Array.isArray(item)) {
      if (item.length > 250) return false;
      if (ancestors.has(item)) return false;
      ancestors.add(item);
      estimatedChars += item.length * 2;
      for (const child of item) {
        if (!visit(child, depth + 1, ancestors)) return false;
      }
      ancestors.delete(item);
    } else if (typeof item === "object") {
      if (ancestors.has(item)) return false;
      ancestors.add(item);
      const entries = Object.entries(item as Record<string, unknown>);
      if (entries.length > 160) return false;
      for (const [key, child] of entries) {
        if (key.length > 300) estimatedChars += 300;
        else estimatedChars += key.length;
        if (!visit(child, depth + 1, ancestors)) return false;
      }
      ancestors.delete(item);
    } else {
      return false;
    }

    if (estimatedChars > 300_000) return false;
    return true;
  };

  return visit(value, 0, new Set());
}
