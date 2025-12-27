export function createDefaultState() {
  const now = Date.now();
  return {
    meta: {
      schema: 2,
      lastSeenAt: now,
      lastSaveAt: 0,
      offlineSummary: [],
      offlineNeedsAck: false,
    },
    phase: "phase0_onboarding",
    phases: {
      phase0_onboarding: {
        step: "auth", // "auth" | "username"
      },
      phase1: {
        signal: 0,
        signalPerSecond: 1,
        pingPower: 5,
        upgrades: {
          spsBoost: 0,     // +SPS per level
          pingBoost: 0,    // +Ping Power per level
          spsMult: 0,      // multiplicative SPS
        },
      },
    },
  };
}

export const clone = (obj) => JSON.parse(JSON.stringify(obj));
