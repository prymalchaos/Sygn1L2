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

function nfmt(n) {
  const x = Math.floor(Number(n) || 0);
  return x.toLocaleString();
}

function costFor(base, growth, lvl) {
  return Math.floor(base * Math.pow(growth, lvl));
}

// Phase 1 upgrades live entirely inside the phase plugin (modular by design)
const UPGRADE_DEFS = [
  {
    id: "spsBoost",
    name: "Signal Booster Coil",
    desc: "Increase Signal/sec.",
    base: 25,
    growth: 1.55,
    effectText: (lvl) => `+${(lvl + 1) * 1} SPS`,
    apply: (p1, nextLvl) => {
      // Each level adds +1 SPS (simple, readable baseline)
      p1.signalPerSecond += 1;
      p1.upgrades.spsBoost = nextLvl;
    },
  },
  {
    id: "pingBoost",
    name: "Ping Amplifier",
    desc: "Increase Ping power.",
    base: 40,
    growth: 1.60,
    effectText: (lvl) => `+${(lvl + 1) * 2} Ping`,
    apply: (p1, nextLvl) => {
      // Each level adds +2 Ping Power
      p1.pingPower += 2;
      p1.upgrades.pingBoost = nextLvl;
    },
  },
  {
    id: "spsMult",
    name: "Resonance Stabiliser",
    desc: "Multiply Signal/sec.",
    base: 120,
    growth: 1.85,
    effectText: (lvl) => `x${(1 + (lvl + 1) * 0.10).toFixed(2)} SPS`,
    apply: (p1, nextLvl) => {
      // Apply multiplicative upgrade by recalculating from a derived base:
      // We store base SPS separately so we can apply multipliers cleanly.
      p1._baseSps ??= p1.signalPerSecond;

      // Remove previous multiplier, then apply new one
      const prevMult = 1 + (p1.upgrades.spsMult || 0) * 0.10;
      const nextMult = 1 + nextLvl * 0.10;

      const baseSps = p1._baseSps / prevMult;
      p1._baseSps = baseSps * nextMult;
      p1.signalPerSecond = p1._baseSps;

      p1.upgrades.spsMult = nextLvl;
    },
  },
];

export default {
  id: "phase1",

  mount(root, api) {
    const profile = api.getProfile();
    const isDev = profile?.username === "PrymalChaos" || profile?.role === "admin";

    // Make sure phase1 state has new fields even if loading an old save
    const stInit = api.getState();
    stInit.phases.phase1.pingPower ??= 5;
    stInit.phases.phase1.upgrades ??= { spsBoost: 0, pingBoost: 0, spsMult: 0 };
    api.setState(stInit);

    root.innerHTML = `
      <div style="max-width: 820px; margin: 0 auto; padding: 14px;">
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

          <div style="display:grid; gap:12px;">
            <div style="display:flex; gap:12px; align-items:flex-end; justify-content:space-between; flex-wrap:wrap;">
              <div>
                <div style="opacity:0.85; font-size:13px;">Signal</div>
                <div id="signal" style="font-size:30px; font-weight:900;">0</div>
              </div>

              <div style="text-align:right;">
                <div style="opacity:0.85; font-size:13px;">Signal / sec</div>
                <div id="sps" style="font-size:18px; font-weight:800;">0</div>
              </div>

              <div style="text-align:right;">
                <div style="opacity:0.85; font-size:13px;">Ping Power</div>
                <div id="pingPower" style="font-size:18px; font-weight:800;">0</div>
              </div>
            </div>

            <div style="display:flex; gap:10px;">
              <button id="ping" style="flex:1; padding:12px; border-radius:10px;">Ping</button>
            </div>

            <div style="border-top:1px solid rgba(215,255,224,0.12); padding-top:12px;">
              <div style="font-weight:900; letter-spacing:0.06em;">UPGRADES</div>
              <div style="opacity:0.8; font-size:13px; margin-top:6px;">
                Buy upgrades to increase passive generation and improve Ping efficiency.
              </div>
              <div id="shop" style="margin-top:10px; display:grid; gap:10px;"></div>
            </div>
          </div>

          <div id="devPanel" style="display:${isDev ? "block" : "none"}; margin-top:16px;">
            <hr style="border:0; border-top:1px solid rgba(215,255,224,0.12); margin:14px 0;">
            <div style="font-weight:900; letter-spacing:0.06em;">DEV PANEL</div>

            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
              <button id="wipe" style="padding:10px; border-radius:10px;">Wipe my save</button>
              <button id="grant" style="padding:10px; border-radius:10px;">+1,000 signal</button>
              <button id="grantBig" style="padding:10px; border-radius:10px;">+50,000 signal</button>
              <button id="phase0" style="padding:10px; border-radius:10px;">Go phase 0</button>
              <button id="phase1" style="padding:10px; border-radius:10px;">Go phase 1</button>
            </div>

            <div id="devMsg" style="margin-top:10px; font-size:13px; opacity:0.9;"></div>
          </div>

          <div id="offlineOverlay" style="display:none; position:absolute; inset:0; border-radius:12px; background: rgba(5,7,10,0.92); padding:14px;">
            <div style="border:1px solid rgba(215,255,224,0.18); border-radius:12px; padding:14px; background: rgba(10,14,18,0.85);">
              <div style="font-weight:900; letter-spacing:0.06em;">RETURN REPORT</div>
              <div id="offlineBody" style="margin-top:10px; font-size:14px; opacity:0.92;"></div>
              <button id="offlineAck" style="margin-top:12px; padding:10px; border-radius:10px; width:100%;">ACK</button>
            </div>
          </div>

        </div>
      </div>
    `;

    const $signal = root.querySelector("#signal");
    const $sps = root.querySelector("#sps");
    const $pingPower = root.querySelector("#pingPower");
    const $shop = root.querySelector("#shop");

    root.querySelector("#logout").onclick = async () => {
      await api.supabase.auth.signOut();
    };

    root.querySelector("#ping").onclick = () => {
      const st = api.getState();
      const p1 = st.phases.phase1;
      p1.signal += p1.pingPower || 5;
      api.setState(st);
      api.saveSoon();
      render();
    };

    function buy(upgradeId) {
      const st = api.getState();
      const p1 = st.phases.phase1;
      p1.upgrades ??= { spsBoost: 0, pingBoost: 0, spsMult: 0 };

      const def = UPGRADE_DEFS.find((u) => u.id === upgradeId);
      if (!def) return;

      const lvl = p1.upgrades[upgradeId] || 0;
      const nextLvl = lvl + 1;
      const cost = costFor(def.base, def.growth, lvl);

      if ((p1.signal || 0) < cost) return;

      p1.signal -= cost;
      def.apply(p1, nextLvl);

      api.setState(st);
      api.saveSoon();
      render();
    }

    function renderShop() {
      const st = api.getState();
      const p1 = st.phases.phase1;
      p1.upgrades ??= { spsBoost: 0, pingBoost: 0, spsMult: 0 };

      $shop.innerHTML = "";

      for (const def of UPGRADE_DEFS) {
        const lvl = p1.upgrades[def.id] || 0;
        const cost = costFor(def.base, def.growth, lvl);
        const canBuy = (p1.signal || 0) >= cost;

        const row = document.createElement("div");
        row.style.border = "1px solid rgba(215,255,224,0.12)";
        row.style.borderRadius = "12px";
        row.style.padding = "12px";
        row.style.background = "rgba(5,7,10,0.35)";
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap;">
            <div style="min-width: 220px;">
              <div style="font-weight:900; letter-spacing:0.03em;">${escapeHtml(def.name)}</div>
              <div style="opacity:0.8; font-size:13px; margin-top:4px;">${escapeHtml(def.desc)}</div>
              <div style="opacity:0.9; font-size:13px; margin-top:6px;">
                Level <b>${lvl}</b> → ${escapeHtml(def.effectText(lvl))}
              </div>
            </div>

            <div style="text-align:right;">
              <div style="opacity:0.75; font-size:13px;">Cost</div>
              <div style="font-weight:900; font-size:18px;">${nfmt(cost)}</div>
              <button data-buy="${def.id}" ${canBuy ? "" : "disabled"}
                style="margin-top:6px; padding:10px; border-radius:10px; ${canBuy ? "" : "opacity:0.5;"}">
                Buy
              </button>
            </div>
          </div>
        `;
        row.querySelector(`[data-buy="${def.id}"]`).onclick = () => buy(def.id);
        $shop.appendChild(row);
      }
    }

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

    // Dev tools (kept lightweight, no admin edge functions)
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
        api.saveSoon();
        setDevMsg("+1,000 signal.");
        render();
      };

      root.querySelector("#grantBig").onclick = () => {
        const st = api.getState();
        st.phases.phase1.signal += 50_000;
        api.setState(st);
        api.saveSoon();
        setDevMsg("+50,000 signal.");
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
      $signal.textContent = nfmt(p1.signal);
      $sps.textContent = (p1.signalPerSecond || 0).toFixed(2);
      $pingPower.textContent = nfmt(p1.pingPower || 5);
      renderShop();
    }

    render();
    const repaintTimer = setInterval(render, 500); // shop refresh isn't urgent

    this._cleanup = () => clearInterval(repaintTimer);
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
