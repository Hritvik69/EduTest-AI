export function isDemoModeEnabled() {
  return (
    process.env.EDUTEST_DEMO_MODE === "true" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.EDUTEST_DEMO_MODE !== "false")
  );
}

export function assertDemoModeAllowed(requested: boolean) {
  if (!requested) {
    throw new Error("Demo mode must be requested explicitly.");
  }

  if (!isDemoModeEnabled()) {
    throw new Error("Demo mode is disabled for this environment.");
  }
}

export function demoMetadata() {
  return {
    isDemoMode: true,
    demoReason: "Explicit demo mode requested.",
  };
}
