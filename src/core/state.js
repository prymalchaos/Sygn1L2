export function createDefaultState() {
  const now = Date.now();
  return {
    meta: {
      schema: 3,
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
        // Core loop
        signal: 0,
        signalPerSecond: 1,
        pingPower: 5,

        // Pressure mechanic
        corruption: 0,           // 0..100
        baseCorruptionRate: 0.18, // per second baseline
        isDefeated: false,

        // Logs (kept small)
        comms: [],
        transmission: [],

        // Upgrades (phase-local)
        upgrades: {
          spsBoost: 0,
          pingBoost: 0,
          spsMult: 0,
          noiseCanceller: 0,
          purgeEfficiency: 0,
        },
      },
    },
  };
}

export const clone = (obj) => JSON.parse(JSON.stringify(obj));
