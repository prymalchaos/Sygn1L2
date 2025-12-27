export function createDefaultState() {
  const now = Date.now();
  return {
    meta: {
      schema: 1,
      lastSeenAt: now,
      lastSaveAt: 0,
      offlineSummary: [],
    },
    phase: "phase0_onboarding",
    phases: {
      phase0_onboarding: {
        step: "auth", // "auth" | "username"
      },
      phase1: {
        signal: 0,
        signalPerSecond: 1,
        lastOfflineReport: null,
      },
    },
  };
}

export const clone = (obj) => JSON.parse(JSON.stringify(obj));