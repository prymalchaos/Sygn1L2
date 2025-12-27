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
let profile = null;
let autosaveTimer = null;

function isMissingSession(err) {
  const msg = (err?.message || String(err || "")).toLowerCase();
  return msg.includes("auth session missing");
}

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
    saveNow: async () => { await saveNow(); },
  };
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

/**
 * Core routing truth:
 * - No session user => onboarding auth step
 * - Session user but no profile => onboarding username step
 * - Session user + profile => phase1 (or keep current non-onboarding phase)
 */
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

  // Has profile
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
  await saveState(state); // saveState safely no-ops if logged out
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

async function start() {
  await loadPlugins();

  const saved = await loadSave(); // safe even when logged out
  if (saved) state = saved;

  const app = document.getElementById("app");
  mountEl = createShell(app);

  installSaveTriggers();
  startAutosaveLoop();

  // Auth state changes (login/logout)
  supabase.auth.onAuthStateChange(async (_event, _session) => {
    await ensureRoutingAfterAuth();
    await saveNow();
  });

  // Initial route
  await ensureRoutingAfterAuth();

  // If we landed into a non-onboarding phase, apply offline gains
  if (state.phase !== "phase0_onboarding") {
    applyOfflineProgressIfAny();
    await saveNow();
    await switchPhase(state.phase); // refresh UI with offline changes
  }
}

start().catch((e) => {
  console.error(e);
  alert(`Boot error: ${e?.message || e}`);
});