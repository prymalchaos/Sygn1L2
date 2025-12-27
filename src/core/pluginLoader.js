const plugins = new Map();

export async function loadPlugins() {
  const phase0 = await import("../plugins/phase0_onboarding/plugin.js");
  const phase1 = await import("../plugins/phase1/plugin.js");

  plugins.set(phase0.default.id, phase0.default);
  plugins.set(phase1.default.id, phase1.default);
}

export function getPlugin(id) {
  return plugins.get(id);
}