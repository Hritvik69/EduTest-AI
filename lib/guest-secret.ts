const localGuestSecret = "edutest-local-guest-session-secret";
const minimumProductionSecretLength = 32;

export function guestSigningSecret() {
  const configured =
    process.env.EDUTEST_GUEST_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();

  if (configured) {
    if (isProductionRuntime() && configured.length < minimumProductionSecretLength) {
      throw new Error(
        "EDUTEST_GUEST_SECRET or NEXTAUTH_SECRET must be at least 32 characters in production.",
      );
    }
    return configured;
  }

  if (isProductionRuntime()) {
    throw new Error(
      "EDUTEST_GUEST_SECRET or NEXTAUTH_SECRET is required for guest sessions in production.",
    );
  }

  return localGuestSecret;
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}
