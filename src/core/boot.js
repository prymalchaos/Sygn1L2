import { createShell } from "./uiShell.js";
import { loadPlugins, getPlugin } from "./pluginLoader.js";
import { createDefaultState } from "./state.js";
import { loadSave, saveState } from "./save.js";

let state = createDefaultState();
let activePlugin;

async function start() {
  await loadPlugins();

  const saved = await loadSave();
  if (saved) state = saved;

  const app = document.getElementById("app");
  const mount = createShell(app);

  switchPhase(state.phase, mount);

  setInterval(() => saveState(state), 30000);
}

async function switchPhase(id, mount) {
  mount.innerHTML = "";
  activePlugin = getPlugin(id);
  activePlugin.mount(mount, {
    getState: () => state,
    setState: s => state = s,
    setPhase: p => {
      state.phase = p;
      switchPhase(p, mount);
    }
  });
}

start();