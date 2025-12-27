import { createShell } from "./uiShell.js";
import { loadPlugins, getPlugin } from "./pluginLoader.js";
import { createDefaultState, clone } from "./state.js";
import { loadSave, saveState } from "./save.js";
import { supabase } from "./supabaseClient.js";

const AUTOSAVE_MS = 45_000;
let state = createDefaultState();

let mountEl;
let activePluginId = null;
let activePlugin = null;

let profile = null; // { id, username, role }
let autosaveTimer = null;

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

    saveNow: async () => {
      await saveNow();
    },
  };
}

async function fetchMyProfile() {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function ensureRoutingAfterAuth() {
  profile = await fetchMyProfile();

  if (!profile) {
    // Logged in but no profile yet
    state.phase = "phase0_onboarding";
    state.phases.phase0_onboarding.step = "username";
    await switchPhase("phase0_onboarding");
    return;
  }

  // Has profile. If still in onboarding, move to phase1.
  if (state.phase === "phase0_onboarding") state.phase = "phase1";
  await switchPhase(state.phase);
}

function applyOfflineProgressIfAny() {
  const now = Date.now();
  const last = state.meta.lastSeenAt || now;
  const dtMs = Math.max(0, now - last);

  if (dtMs < 1000) {
    state.meta.lastSeenAt = now;
    state.meta.offlineSummary = [];
    return;
  }

  const plugin = getPlugin(state.phase);
  const phaseId = state.phase;
  const phaseState = state.phases[phaseId] ?? {};

  if (plugin?.applyOfflineProgress) {
    const api = apiFactory();
    const res = plugin.applyOfflineProgress({ state: phaseState, dtMs, api });

    if (res?.state) state.phases[phaseId] = res.state;
    state.meta.offlineSummary = Array.isArray(res?.summary) ? res.summary : [];
  } else {
    state.meta.offlineSummary = [];
  }

  state.meta.lastSeenAt = now;
}

async function saveNow() {
  state.meta.lastSaveAt = Date.now();
  await saveState(state);
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

  // Ensure phase state exists
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

async function start() {
  await loadPlugins();

  const saved = await loadSave();
  if (saved) state = saved;

  const app = document.getElementById("app");
  mountEl = createShell(app);

  installSaveTriggers();
  startAutosaveLoop();

  // Auth state changes (login/logout)
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) {
      profile = null;
      state = createDefaultState();
      state.phase = "phase0_onboarding";
      await switchPhase("phase0_onboarding");
      return;
    }

    // Logged in
    await ensureRoutingAfterAuth();
    await saveNow();
  });

  // Initial route based on current session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    profile = null;
    state.phase = "phase0_onboarding";
    await switchPhase("phase0_onboarding");
    return;
  }

  // Logged in
  await ensureRoutingAfterAuth();

  // Apply offline gains after plugin is ready
  applyOfflineProgressIfAny();
  await saveNow();

  // Re-mount current phase to reflect offline changes
  await switchPhase(state.phase);
}

start().catch((e) => {
  console.error(e);
  alert(`Boot error: ${e?.message || e}`);
});