import { wipeMySave } from "../../core/save.js";
import { createDefaultState } from "../../core/state.js";

function fmtMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r}s`;
}

export default {
  id: "phase1",

  mount(root, api) {
    let raf = null;
    let last = Date.now();

    const profile = api.getProfile();
    const isDev = profile?.username === "PrymalChaos";

    root.innerHTML = `
      <div style="max-width: 760px; margin: 0 auto; padding: 14px;">
        <div style="border:1px solid rgba(215,255,224,0.18); border-radius:12px; padding:14px; background: rgba(10,14,18,0.7);">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div>
              <div style="opacity:0.85; font-size:13px;">Logged in as</div>
              <div style="font-weight:700; letter-spacing:0.05em;">${profile?.username ?? "UNKNOWN"}</div>
            </div>
            <button id="logout" style="padding:10px; border-radius:10px;">Logout</button>
          </div>

          <hr style="border:0; border-top:1px solid rgba(215,255,224,0.12); margin:14px 0;">

          <div id="offline" style="font-size:13px; opacity:0.9; margin-bottom:10px;"></div>

          <div style="display:grid; gap:10px;">
            <div style="display:flex; gap:10px; align-items:center; justify-content:space-between;">
              <div>
                <div style="opacity:0.85; font-size:13px;">Signal</div>
                <div id="signal" style="font-size:28px; font-weight:800;">0</div>
              </div>
              <div style="text-align:right;">
                <div style="opacity:0.85; font-size:13px;">Signal / sec</div>
                <div id="sps" style="font-size:18px; font-weight:700;">0</div>
              </div>
            </div>

            <div style="display:flex; gap:10px;">
              <button id="ping" style="flex:1; padding:12px; border-radius:10px;">Ping</button>
              <button id="boost" style="flex:1; padding:12px; border-radius:10px;">+0.5 SPS</button>
            </div>
          </div>

          <div id="devPanel" style="display:${isDev ? "block" : "none"}; margin-top:16px;">
            <hr style="border:0; border-top:1px solid rgba(215,255,224,0.12); margin:14px 0;">
            <div style="font-weight:800; letter-spacing:0.06em;">DEV PANEL</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
              <button id="wipe" style="padding:10px; border-radius:10px;">Wipe my save</button>
              <button id="grant" style="padding:10px; border-radius:10px;">+1000 signal</button>
              <button id="phase0" style="padding:10px; border-radius:10px;">Go phase 0</button>
              <button id="phase1" style="padding:10px; border-radius:10px;">Go phase 1</button>
            </div>
            <div id="devMsg" style="margin-top:10px; font-size:13px; opacity:0.9;"></div>
          </div>
        </div>
      </div>
    `;

    const $signal = root.querySelector("#signal");
    const $sps = root.querySelector("#sps");
    const $offline = root.querySelector("#offline");

    const $logout = root.querySelector("#logout");
    $logout.onclick = async () => {
      await api.supabase.auth.signOut();
    };

    // Show offline summary (from core boot)
    const st0 = api.getState();
    const summary = st0.meta.offlineSummary || [];
    if (summary.length) {
      $offline.innerHTML = `<div style="padding:10px; border-radius:10px; border:1px solid rgba(215,255,224,0.15); background: rgba(5,7,10,0.7);">
        <div style="font-weight:700; margin-bottom:6px;">While you were away</div>
        <ul style="margin:0; padding-left:18px;">
          ${summary.map((x) => `<li>${x}</li>`).join("")}
        </ul>
      </div>`;
    } else {
      $offline.textContent = "";
    }

    const pingBtn = root.querySelector("#ping");
    const boostBtn = root.querySelector("#boost");

    pingBtn.onclick = () => {
      const st = api.getState();
      st.phases.phase1.signal += 5;
      api.setState(st);
      render();
    };

    boostBtn.onclick = () => {
      const st = api.getState();
      st.phases.phase1.signalPerSecond = +(st.phases.phase1.signalPerSecond + 0.5).toFixed(2);
      api.setState(st);
      render();
    };

    // Dev tools (only show for PrymalChaos)
    if (isDev) {
      const devMsg = root.querySelector("#devMsg");
      const setDevMsg = (t) => { devMsg.textContent = t || ""; };

      root.querySelector("#wipe").onclick = async () => {
        setDevMsg("Wiping…");
        const fresh = await wipeMySave(createDefaultState);
        api.setState(fresh);
        await api.setPhase("phase0_onboarding");
        setDevMsg("Wiped. Back to onboarding.");
      };

      root.querySelector("#grant").onclick = () => {
        const st = api.getState();
        st.phases.phase1.signal += 1000;
        api.setState(st);
        setDevMsg("Granted +1000 signal.");
        render();
      };

      root.querySelector("#phase0").onclick = async () => {
        await api.setPhase("phase0_onboarding");
      };
      root.querySelector("#phase1").onclick = async () => {
        await api.setPhase("phase1");
      };
    }

    function render() {
      const st = api.getState();
      const p1 = st.phases.phase1;
      $signal.textContent = Math.floor(p1.signal).toString();
      $sps.textContent = p1.signalPerSecond.toString();
    }

    function loop() {
      const now = Date.now();
      const dt = Math.max(0, now - last);
      last = now;

      const st = api.getState();
      const p1 = st.phases.phase1;
      p1.signal += p1.signalPerSecond * (dt / 1000);
      api.setState(st);

      render();
      raf = requestAnimationFrame(loop);
    }

    render();
    raf = requestAnimationFrame(loop);

    // Store cleanup
    this._cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
    };
  },

  unmount() {
    if (this._cleanup) this._cleanup();
  },

  applyOfflineProgress({ state, dtMs }) {
    // Closed form idle gain
    const before = state.signal || 0;
    const sps = state.signalPerSecond || 0;
    const gain = sps * (dtMs / 1000);
    state.signal = before + gain;

    const summary = [
      `Offline for ${fmtMs(dtMs)}`,
      `Generated +${Math.floor(gain)} signal`,
    ];

    return { state, summary };
  },
};