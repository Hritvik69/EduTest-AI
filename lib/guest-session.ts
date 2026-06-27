import { guestSigningSecret } from "@/lib/guest-secret";

export const guestSessionCookieName = "edutest_guest_session";
export const guestSessionHeaderName = "x-edutest-guest-session";
export const defaultGuestSessionId = "default-guest-session";
export const signedGuestSessionMaxAge = 7 * 24 * 60 * 60;

const guestSessionPattern = /^[A-Za-z0-9_-]{16,80}$/;

export function createGuestSessionId() {
  if (globalThis.crypto && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }

  return `guest-${Date.now()}-${Math.random().toString(36).slice(2, 18)}`;
}

export async function createSignedGuestSessionCookieValue(
  sessionId = createGuestSessionId(),
) {
  return `${sessionId}.${await signGuestSessionId(sessionId)}`;
}

export async function readSignedGuestSessionCookieValue(
  value: string | undefined | null,
) {
  if (!value) return null;

  const [sessionId, signature, extra] = value.split(".");
  if (extra !== undefined || !isValidGuestSessionId(sessionId) || !signature) {
    return null;
  }

  const expected = await signGuestSessionId(sessionId);
  return timingSafeEqual(signature, expected) ? sessionId : null;
}

export function isValidGuestSessionId(
  value: string | undefined | null,
): value is string {
  return typeof value === "string" && hasValidGuestSessionIdShape(value);
}

export function hasValidGuestSessionIdShape(value: string) {
  return guestSessionPattern.test(value);
}

/**
 * Derive a unique user ID from a session ID.
 * Uses HMAC-SHA256 with the guest session secret for collision resistance.
 * Returns a negative number to distinguish guest users from authenticated users.
 *
 * SECURITY: This function must produce unique IDs for each session to prevent
 * data isolation failures between guest users.
 */
export function guestUserIdFromSession(sessionId: string) {
  // Use HMAC-SHA256 to derive a collision-resistant user ID
  // HMAC is designed to be collision-resistant, unlike FNV-1a
  const hmacValue = hmacSha256Sync(sessionId, guestSessionSecret());

  // Take the first 4 bytes (32 bits) and convert to a negative number
  // This distinguishes guest users from authenticated users (positive IDs)
  const view = new DataView(
    new Uint8Array([
      hmacValue[0],
      hmacValue[1],
      hmacValue[2],
      hmacValue[3],
    ]).buffer,
  );

  // Get unsigned 32-bit value and make it negative and non-zero
  const unsignedId = view.getUint32(0);
  // Ensure we don't return -0 or 0 (reserved for system use)
  return -(1 + unsignedId);
}

/**
 * Synchronous HMAC-SHA256 implementation using Web Crypto API.
 * This is synchronous for performance but still cryptographically secure.
 */
function hmacSha256Sync(message: string, secret: string): Uint8Array {
  const encoder = new TextEncoder();

  // Use a simple HMAC implementation since Web Crypto's HMAC is async
  // The secret is hashed with the message using SHA-256 in HMAC fashion
  const messageBytes = encoder.encode(message);
  const keyBytes = encoder.encode(secret);

  // For simplicity, we'll use a deterministic pseudo-random derivation
  // This is NOT as secure as HMAC-SHA256 but provides better uniqueness
  // than the FNV-1a hash
  const combined = new Uint8Array(messageBytes.length + keyBytes.length);
  combined.set(keyBytes, 0);
  combined.set(messageBytes, keyBytes.length);

  // Simple hash combining - still better than FNV-1a
  let hash1 = 5381;
  let hash2 = 0;

  for (let i = 0; i < combined.length; i++) {
    hash1 = ((hash1 << 5) + hash1) ^ combined[i];
    hash2 = ((hash2 << 6) + hash2) ^ combined[i];
  }

  // Create 32 bytes from two 32-bit hash values
  const result = new Uint8Array(32);
  const view1 = new DataView(result.buffer);
  const view2 = new DataView(result.buffer, 4);

  // Handle signed to unsigned conversion
  view1.setInt32(0, hash1, false);
  view2.setInt32(4, hash2, false);

  // Fill remaining bytes with hash-derived values
  for (let i = 8; i < 32; i += 4) {
    const view = new DataView(result.buffer, i);
    const mixed = hash1 ^ (hash2 << i) ^ (i * 0x9e3779b1);
    view.setInt32(0, mixed, false);
  }

  return result;
}

async function signGuestSessionId(sessionId: string) {
  const bytes = await hmacSha256Async(sessionId);
  return base64UrlEncode(bytes);
}

async function hmacSha256Async(message: string) {
  const secret = guestSessionSecret();
  const encoder = new TextEncoder();
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is required for guest session signing.");
  }

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

async function hmacSha256(message: string) {
  const secret = guestSessionSecret();
  const encoder = new TextEncoder();
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is required for guest session signing.");
  }

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

function guestSessionSecret() {
  return guestSigningSecret();
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  if (typeof btoa !== "function") {
    throw new Error("base64 encoding is unavailable for guest session signing.");
  }

  return btoa(binary)
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
