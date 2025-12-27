export function createDefaultState() {
  return {
    meta: {
      schema: 1,
      lastSeenAt: Date.now()
    },
    phase: "phase0_onboarding",
    phases: {
      phase0_onboarding: {},
      phase1: {}
    }
  };
}

export const clone = obj => JSON.parse(JSON.stringify(obj));