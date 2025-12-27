import { createShell } from "./uiShell.js";
import { loadPlugins, getPlugin } from "./pluginLoader.js";
import { createDefaultState, clone } from "./state.js";
import { loadSave, saveState } from "./save.js";
import { supabase } from "./supabaseClient.js";
import { debounce } from "./debounce.js";

const AUTOSAVE_MS = 45_000;
const TICK_MS = 250; // BATTERY MODE

let state = createDefaultState();

let mountEl;
let activePluginId = null;
let activePlugin = null;
let profile = null;

let autosaveTimer = null;
let tickTimer = null;
let lastTickAt = Date.now();

// Tracks which user the in-memory state belongs to, so we don't overwrite cloud saves on login.
let lastAuthUserId = null;

function isMissingSession(err) {
  const msg = (err?.message || String(err || "")).toLowerCase();
  return msg.includes("auth session missing");
}

async function getSessionUser() {
  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr && !isMissingSession(sessErr)) throw sessErr;
  return sessionData?.session?.user ?? null;
}

async function fetchMyProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function saveNow() {
  state.meta.lastSaveAt = Date.now();
  await saveState(state);
}

const saveSoon = debounce(() => {
  saveNow().catch((e) => console.warn(e));
}, 600);

function apiFactory() {
  return {
    supabase,
    getState: () => clone(state),
    setState: (next) => { state = next; },
    getProfile: () => (profile ? { ...profile } : null),

    setPhase: async (phaseId) => {
      state.phase = phaseId;
      await switchPhase(phaseId);
      await saveNow();
    },

    saveSoon: () => saveSoon(),
    saveNow: async () => { await saveNow(); },
  };
}

async function ensureRoutingAfterAuth() {
  const user = await getSessionUser();

  if (!user) {
    profile = null;
    state.phase = "phase0_onboarding";
    state.phases.phase0_onboarding.step = "auth";
    await switchPhase("phase0_onboarding");
    return;
  }

  profile = await fetchMyProfile(user.id);

  if (!profile) {
    state.phase = "phase0_onboarding";
    state.phases.phase0_onboarding.step = "username";
    await switchPhase("phase0_onboarding");
    return;
  }

  if (state.phase === "phase0_onboarding") state.phase = "phase1";
  await switchPhase(state.phase);
}

function applyOfflineProgressIfAny() {
  const now = Date.now();
  const last = state.meta.lastSeenAt || now;
  const dtMs = Math.max(0, now - last);

  state.meta.lastSeenAt = now;

  if (dtMs < 1000) {
    state.meta.offlineSummary = [];
    state.meta.offlineNeedsAck = false;
    return;
  }

  const plugin = getPlugin(state.phase);
  const phaseId = state.phase;
  const phaseState = state.phases[phaseId] ?? {};

  if (plugin?.applyOfflineProgress) {
    const api = apiFactory();
    const res = plugin.applyOfflineProgress({ state: phaseState, dtMs, api });

    if (res?.state) state.phases[phaseId] = res.state;

    const summary = Array.isArray(res?.summary) ? res.summary : [];
    state.meta.offlineSummary = summary;
    state.meta.offlineNeedsAck = summary.length > 0;
  } else {
    state.meta.offlineSummary = [];
    state.meta.offlineNeedsAck = false;
  }
}

async function switchPhase(id) {
  if (!mountEl) return;
  if (id === activePluginId && activePlugin) return;

  const api = apiFactory();

  if (activePlugin?.unmount) {
    try { activePlugin.unmount(api); } catch (e) { console.warn(e); }
  }

  activePluginId = id;
  activePlugin = getPlugin(id);

  if (activePlugin?.getInitialState && state.phases[id] == null) {
    state.phases[id] = activePlugin.getInitialState();
  } else {
    state.phases[id] ??= {};
  }

  mountEl.innerHTML = "";
  await activePlugin.mount(mountEl, api);
}

function installSaveTriggers() {
  const handler = async () => {
    try { await saveNow(); } catch (e) { console.warn(e); }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") handler();
  });

  window.addEventListener("pagehide", handler);
}

function startAutosaveLoop() {
  if (autosaveTimer) clearInterval(autosaveTimer);
  autosaveTimer = setInterval(() => {
    saveNow().catch((e) => console.warn(e));
  }, AUTOSAVE_MS);
}

function startTickLoop() {
  if (tickTimer) clearInterval(tickTimer);
  lastTickAt = Date.now();

  tickTimer = setInterval(() => {
    const now = Date.now();
    const dtMs = Math.max(0, now - lastTickAt);
    lastTickAt = now;

    if (!activePlugin?.tick) return;

    const phaseId = state.phase;
    if (phaseId === "phase0_onboarding") return;

    const api = apiFactory();
    const phaseState = state.phases[phaseId] ?? {};

    try {
      const res = activePlugin.tick({ state: phaseState, dtMs, api });
      if (res?.state) state.phases[phaseId] = res.state;
    } catch (e) {
      console.warn("Tick error:", e);
    }
  }, TICK_MS);
}

async function start() {
  await loadPlugins();

  // Capture current auth user (if any) so we know who state belongs to.
  const bootUser = await getSessionUser();
  lastAuthUserId = bootUser?.id ?? null;

  const saved = await loadSave();
  if (saved) state = saved;

  const app = document.getElementById("app");
  mountEl = createShell(app);

  installSaveTriggers();
  startAutosaveLoop();
  startTickLoop();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    const userId = session?.user?.id ?? null;

    // If auth identity changed, hydrate state from cloud BEFORE we render/save.
    // This prevents overwriting an existing cloud save with a fresh default state on new devices/browsers.
    if (!userId) {
      lastAuthUserId = null;
      state = createDefaultState();
    } else if (userId !== lastAuthUserId) {
      lastAuthUserId = userId;

      const saved = await loadSave();
      if (saved) {
        state = saved;
      } else {
        // New player (or no save yet)
        state = createDefaultState();
      }
    }

    await ensureRoutingAfterAuth();

    if (userId && state.phase !== "phase0_onboarding") {
      applyOfflineProgressIfAny();
    }

    await saveNow();
  });

  await ensureRoutingAfterAuth();

  if (state.phase !== "phase0_onboarding") {
    applyOfflineProgressIfAny();
    await saveNow();
    await switchPhase(state.phase);
  }
}

start().catch((e) => {
  console.error(e);
  alert(`Boot error: ${e?.message || e}`);
});