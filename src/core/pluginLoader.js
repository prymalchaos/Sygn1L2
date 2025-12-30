// src/core/pluginLoader.js
// Loads phase plugins as ES modules.
// GitHub Pages + mobile browsers cache modules aggressively.
// Bump BUILD to force fresh plugin loads.

const plugins = new Map();
const BUILD = "2025-12-30a";

// Expose the current build/version on the window for the UI shell to display.
if (typeof window !== "undefined") {
  try {
    window.SYGN_BUILD = BUILD;
  } catch {
    /* no-op for non-browser environments */
  }
}

export async function loadPlugins() {
  const pluginIds = [
    "phase0_onboarding",
    "phase1",
    "phase2",
  ];

  for (const id of pluginIds) {
    const mod = await import(`../plugins/${id}/plugin.js?v=${encodeURIComponent(BUILD)}`);
    plugins.set(id, mod.default);
  }
}

export function getPlugin(id) {
  const p = plugins.get(id);
  if (!p) throw new Error(`Plugin not found: ${id}`);
  return p;
}
