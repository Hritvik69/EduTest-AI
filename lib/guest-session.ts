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
  return typeof value === "string" && guestSessionPattern.test(value);
}

export function guestUserIdFromSession(sessionId: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < sessionId.length; index += 1) {
    hash ^= sessionId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return -(1 + (hash >>> 1));
}

async function signGuestSessionId(sessionId: string) {
  const bytes = await hmacSha256(sessionId);
  return base64UrlEncode(bytes);
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
  return (
    process.env.EDUTEST_GUEST_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "edutest-local-guest-session-secret"
  );
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
