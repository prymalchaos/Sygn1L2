import { wipeMySave } from "../../core/save.js";
import { createDefaultState } from "../../core/state.js";

function fmtMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r}s`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function callFunction(api, name, payload) {
  const { data, error } = await api.supabase.functions.invoke(name, {
    body: payload || {},
  });

  if (!error) return data;

  // Best effort extraction of useful details
  const status =
    error?.context?.status ||
    error?.status ||
    "unknown";

  let details = "";
  try {
    // Supabase sometimes puts response text/json here:
    const ctx = error?.context;
    if (ctx?.body) {
      if (typeof ctx.body === "string") details = ctx.body;
      else details = JSON.stringify(ctx.body);
    } else if (ctx?.response) {
      details = await ctx.response.text();
    }
  } catch (_) {
    // ignore
  }

  const msg = error?.message || `Function ${name} failed`;
  throw new Error(`${msg} (status ${status})${details ? `: ${details}` : ""}`);
}
export default {
  id: "phase1",

  mount(root, api) {
    const profile = api.getProfile();
    const isDev = profile?.username === "PrymalChaos" || profile?.role === "admin";

    root.innerHTML = `
      <div style="max-width: 760px; margin: 0 auto; padding: 14px;">
        <div style="border:1px solid rgba(215,255,224,0.18); border-radius:12px; padding:14px; background: rgba(10,14,18,0.7); position:relative;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div>
              <div style="opacity:0.85; font-size:13px;">Logged in as</div>
              <div style="font-weight:700; letter-spacing:0.05em;">
                ${escapeHtml(profile?.username ?? "UNKNOWN")}
                <span style="opacity:0.7; font-weight:600; font-size:12px;">
                  ${profile?.role ? `(${escapeHtml(profile.role)})` : ""}
                </span>
              </div>
            </div>
            <button id="logout" style="padding:10px; border-radius:10px;">Logout</button>
          </div>

          <hr style="border:0; border-top:1px solid rgba(215,255,224,0.12); margin:14px 0;">

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

            <div style="margin-top:12px; border-top:1px solid rgba(215,255,224,0.12); padding-top:12px;">
              <div style="font-weight:800; letter-spacing:0.06em; opacity:0.95;">ADMIN TOOLS</div>
              <div style="opacity:0.85; font-size:13px; margin-top:6px;">
                Requires Edge Functions: <code>admin-users</code>, <code>admin-user-delete</code>.
              </div>

              <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                <button id="listUsers" style="padding:10px; border-radius:10px;">List users</button>
                <button id="deleteTarget" style="padding:10px; border-radius:10px;">Delete user (user id)</button>
              </div>

              <div style="margin-top:10px; display:grid; gap:8px;">
                <input id="targetUserId" placeholder="Target user_id (uuid)"
                  style="padding:10px; border-radius:10px; border:1px solid rgba(215,255,224,0.2); background:#05070a; color:#d7ffe0;">
              </div>

              <div id="adminOut" style="margin-top:10px; font-size:13px; opacity:0.95; white-space:pre-wrap;"></div>
            </div>

            <div id="devMsg" style="margin-top:10px; font-size:13px; opacity:0.9;"></div>
          </div>

          <div id="offlineOverlay" style="display:none; position:absolute; inset:0; border-radius:12px; background: rgba(5,7,10,0.92); padding:14px;">
            <div style="border:1px solid rgba(215,255,224,0.18); border-radius:12px; padding:14px; background: rgba(10,14,18,0.85);">
              <div style="font-weight:800; letter-spacing:0.06em;">RETURN REPORT</div>
              <div id="offlineBody" style="margin-top:10px; font-size:14px; opacity:0.92;"></div>
              <button id="offlineAck" style="margin-top:12px; padding:10px; border-radius:10px; width:100%;">ACK</button>
            </div>
          </div>

        </div>
      </div>
    `;

    const $signal = root.querySelector("#signal");
    const $sps = root.querySelector("#sps");

    root.querySelector("#logout").onclick = async () => {
      await api.supabase.auth.signOut();
    };

    const pingBtn = root.querySelector("#ping");
    const boostBtn = root.querySelector("#boost");

    pingBtn.onclick = () => {
      const st = api.getState();
      st.phases.phase1.signal += 5;
      api.setState(st);
      api.saveSoon();
      render();
    };

    boostBtn.onclick = () => {
      const st = api.getState();
      st.phases.phase1.signalPerSecond = +(st.phases.phase1.signalPerSecond + 0.5).toFixed(2);
      api.setState(st);
      api.saveSoon();
      render();
    };

    // Offline overlay (ACK)
    const overlay = root.querySelector("#offlineOverlay");
    const body = root.querySelector("#offlineBody");
    const ack = root.querySelector("#offlineAck");

    const st0 = api.getState();
    if (st0.meta.offlineNeedsAck && (st0.meta.offlineSummary || []).length) {
      const items = st0.meta.offlineSummary.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
      body.innerHTML = `<ul style="margin:0; padding-left:18px;">${items}</ul>`;
      overlay.style.display = "block";

      ack.onclick = () => {
        const st = api.getState();
        st.meta.offlineNeedsAck = false;
        st.meta.offlineSummary = [];
        api.setState(st);
        api.saveSoon();
        overlay.style.display = "none";
      };
    }

    // Dev/Admin tools
    if (isDev) {
      const devMsg = root.querySelector("#devMsg");
      const adminOut = root.querySelector("#adminOut");
      const targetUserIdEl = root.querySelector("#targetUserId");

      const setDevMsg = (t) => { devMsg.textContent = t || ""; };
      const setAdminOut = (t) => { adminOut.textContent = t || ""; };

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
        api.saveSoon();
        setDevMsg("Granted +1000 signal.");
        render();
      };

      root.querySelector("#phase0").onclick = async () => {
        await api.setPhase("phase0_onboarding");
      };
      root.querySelector("#phase1").onclick = async () => {
        await api.setPhase("phase1");
      };

      root.querySelector("#listUsers").onclick = async () => {
        setAdminOut("Calling admin-users…");
        try {
          const res = await callFunction(api, "admin-users", {});
          const lines = (res?.users || []).map((u) => `${u.id}  ${u.email || ""}`);
          setAdminOut(lines.join("\n") || "(no users returned)");
        } catch (e) {
          setAdminOut(`Error: ${e?.message || e}`);
        }
      };

      root.querySelector("#deleteTarget").onclick = async () => {
        const user_id = targetUserIdEl.value.trim();
        if (!user_id) { setAdminOut("Enter a target user_id first."); return; }

        if (!confirm(`Delete user ${user_id}? This cannot be undone.`)) return;

        setAdminOut("Calling admin-user-delete…");
        try {
          const res = await callFunction(api, "admin-user-delete", { user_id });
          setAdminOut(`Deleted: ${res?.deleted || user_id}`);
        } catch (e) {
          setAdminOut(`Error: ${e?.message || e}`);
        }
      };
    }

    function render() {
      const st = api.getState();
      const p1 = st.phases.phase1;
      $signal.textContent = Math.floor(p1.signal).toString();
      $sps.textContent = p1.signalPerSecond.toString();
    }

    // Battery-friendly repaint loop
    render();
    const repaintTimer = setInterval(render, 250);

    this._cleanup = () => {
      clearInterval(repaintTimer);
    };
  },

  unmount() {
    if (this._cleanup) this._cleanup();
  },

  tick({ state, dtMs }) {
    const sps = state.signalPerSecond || 0;
    state.signal = (state.signal || 0) + sps * (dtMs / 1000);
    return { state };
  },

  applyOfflineProgress({ state, dtMs }) {
    const before = state.signal || 0;
    const sps = state.signalPerSecond || 0;
    const gain = sps * (dtMs / 1000);
    state.signal = before + gain;

    const summary = [
      `Offline for ${fmtMs(dtMs)}`,
      `Generated +${Math.floor(gain)} signal`,
      `New total: ${Math.floor(state.signal)} signal`,
    ];

    return { state, summary };
  },
};