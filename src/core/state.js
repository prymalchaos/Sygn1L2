export function createDefaultState() {
  const now = Date.now();
  return {
    meta: {
      schema: 6,
      lastSeenAt: now,
      lastSaveAt: 0,
      offlineSummary: [],
      offlineNeedsAck: false,

      // Phase unlocks (kept core-agnostic; phases decide what to unlock)
      unlockedPhases: {
        phase1: true,
        phase2: false,
      },
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
        corruption: 0,            // 0..100
        baseCorruptionRate: 0.18, // per second baseline
        isDefeated: false,

        // Win state
        completed: false,
        winHoldMs: 0,

        // Logs (kept small)
        comms: [],
        transmission: [],

        // Upgrades (phase-local)
        // Milestone persistence (phase-local)
        flags: {},
        stats: { purges: 0, upgradesBought: 0 },

        upgrades: {
          spsBoost: 0,
          pingBoost: 0,
          spsMult: 0,
          noiseCanceller: 0,
          purgeEfficiency: 0,
          autopilotCore: 0,

        autopilot: {
          unlocked: false,
          enabled: false,
          targetCorruption: 40,
          budgetFraction: 0.35,
          offlineCap: 95,
          budget: 0,
        },
        },
      },

      // Phase 2: Engineering Bay prototype (Power + Heat + Reroute)
      phase2: {
        bootedAt: now,

        signal: 0,
        signalPerSecond: 0.5,

        power: 0,
        powerPerSecond: 1.0,

        heat: 0,                 // 0..100 (overheat pressure)
        heatRateBase: 0.10,      // per second baseline
        isOverheated: false,

        reroute: {
          active: false,
          powerDrainPerSec: 2.2,
          spsMultiplier: 2.0,
          heatAddPerSec: 0.75,
        },

        upgrades: {
          generator: 0,          // +power/sec
          insulation: 0,         // reduces heat rate
          rerouteEfficiency: 0,  // lowers drain / heat add
          venting: 0,            // stronger vent
        },

        comms: [],
        transmission: [],
      },
    },
  };
}

export const clone = (obj) => JSON.parse(JSON.stringify(obj));
