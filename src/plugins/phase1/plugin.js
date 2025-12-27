import { wipeMySave } from "../../core/save.js";
import { createDefaultState } from "../../core/state.js";

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

function fmtPct(x) {
  const v = Math.max(0, Math.min(100, Number(x) || 0));
  return `${Math.floor(v)}%`;
}

function fmtMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r}s`;
}

function costFor(base, growth, lvl) {
  return Math.floor(base * Math.pow(growth, lvl));
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function nowStamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function pushLog(arr, line, max = 60) {
  arr.push(`[${nowStamp()}] ${line}`);
  while (arr.length > max) arr.shift();
}

const UPGRADE_DEFS = [
  {
    id: "spsBoost",
    name: "Signal Booster Coil",
    desc: "Increase Signal/sec.",
    base: 25,
    growth: 1.55,
    effectText: (lvl) => `+${(lvl + 1) * 1} SPS`,
    apply: (p1, nextLvl) => {
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
      p1._baseSps ??= p1.signalPerSecond;
      const prevMult = 1 + (p1.upgrades.spsMult || 0) * 0.10;
      const nextMult = 1 + nextLvl * 0.10;
      const baseSps = p1._baseSps / prevMult;
      p1._baseSps = baseSps * nextMult;
      p1.signalPerSecond = p1._baseSps;
      p1.upgrades.spsMult = nextLvl;
    },
  },
  {
    id: "noiseCanceller",
    name: "Noise Canceller",
    desc: "Slows corruption growth.",
    base: 80,
    growth: 1.75,
    effectText: (lvl) => `-${Math.floor((lvl + 1) * 8)}% corruption rate`,
    apply: (p1, nextLvl) => {
      p1.upgrades.noiseCanceller = nextLvl;
    },
  },
  {
    id: "purgeEfficiency",
    name: "Purge Manifold",
    desc: "Makes Purge cheaper and stronger.",
    base: 140,
    growth: 1.85,
    effectText: (lvl) => `+${Math.floor((lvl + 1) * 10)}% purge power`,
    apply: (p1, nextLvl) => {
      p1.upgrades.purgeEfficiency = nextLvl;
    },
  },
];

function computeCorruptionRate(p1) {
  const base = Number(p1.baseCorruptionRate || 0.18);

  const noiseLvl = p1.upgrades?.noiseCanceller || 0;
  const noiseReduction = clamp(noiseLvl * 0.08, 0, 0.75); // up to 75%

  // Small scaling with progression so it becomes a "late phase" fight
  const scale = clamp((p1.signal || 0) / 100000, 0, 2.0); // 0..2
  const scaledAdd = 0.06 * scale;

  return base * (1 - noiseReduction) + scaledAdd;
}

function purgeCost(p1) {
  const lvl = p1.upgrades?.purgeEfficiency || 0;
  const reduction = clamp(lvl * 0.07, 0, 0.6);
  return Math.floor(60 * (1 - reduction));
}

function purgeAmount(p1) {
  const lvl = p1.upgrades?.purgeEfficiency || 0;
  const mult = 1 + lvl * 0.10;
  return 18 * mult; // percentage points
}

export default {
  id: "phase1",

  mount(root, api) {
    const profile = api.getProfile();
    const isDev = profile?.username === "PrymalChaos" || profile?.role === "admin";

    // Backfill state for older saves (no migration system needed yet)
    const stInit = api.getState();
    const p1 = stInit.phases.phase1 ??= {};
    p1.signal ??= 0;
    p1.signalPerSecond ??= 1;
    p1.pingPower ??= 5;
    p1.corruption ??= 0;
    p1.baseCorruptionRate ??= 0.18;
    p1.isDefeated ??= false;
    p1.comms ??= [];
    p1.transmission ??= [];
    p1.upgrades ??= { spsBoost: 0, pingBoost: 0, spsMult: 0, noiseCanceller: 0, purgeEfficiency: 0 };
    api.setState(stInit);

    if (p1.comms.length === 0) {
      pushLog(p1.comms, "CONTROL//RETURN  Signal lock established. Phase 1 online.");
      pushLog(p1.comms, "CONTROL//NOTE  Corruption present. Maintain integrity.");
      api.setState(stInit);
      api.saveSoon();
    }

    // Panel-heavy “ship console” UI, phase-local styling
    root.innerHTML = `
      <style>
        .p1-grid { display: grid; gap: 12px; }
        .p1-panel {
          border: 1px solid rgba(215,255,224,0.16);
          border-radius: 12px;
          background: rgba(10,14,18,0.72);
          padding: 12px;
          position: relative;
          overflow: hidden;
        }
        .p1-title { font-weight: 900; letter-spacing: 0.08em; font-size: 12px; opacity: 0.9; }
        .p1-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .p1-scan:before {
          content: "";
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            to bottom,
            rgba(215,255,224,0.06) 0px,
            rgba(215,255,224,0.03) 1px,
            rgba(0,0,0,0) 3px
          );
          opacity: 0.35;
          pointer-events: none;
          mix-blend-mode: screen;
        }
        .p1-btn {
          padding: 10px;
          border-radius: 10px;
          border: 1px solid rgba(215,255,224,0.18);
          background: rgba(5,7,10,0.35);
          color: inherit;
        }
        .p1-btn:disabled { opacity: 0.45; }
        .p1-row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; }
        .p1-stat { min-width: 140px; }
        .p1-label { font-size: 12px; opacity: 0.82; }
        .p1-value { font-size: 20px; font-weight: 900; }
        .p1-bar {
          height: 10px;
          border-radius: 99px;
          border: 1px solid rgba(215,255,224,0.14);
          background: rgba(5,7,10,0.35);
          overflow: hidden;
        }
        .p1-fill {
          height: 100%;
          width: 0%;
          background: rgba(215,255,224,0.55);
        }
        .p1-two {
          display:grid;
          grid-template-columns: 1fr 260px;
          gap: 12px;
        }
        @media (max-width: 740px) {
          .p1-two { grid-template-columns: 1fr; }
        }
        .p1-logs {
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 740px) {
          .p1-logs { grid-template-columns: 1fr; }
        }
        .p1-logbox {
          height: 180px;
          overflow: auto;
          border-radius: 10px;
          border: 1px solid rgba(215,255,224,0.12);
          background: rgba(5,7,10,0.30);
          padding: 10px;
          line-height: 1.35;
          font-size: 12px;
          opacity: 0.92;
          white-space: pre-wrap;
        }
      </style>

      <div style="max-width: 980px; margin: 0 auto; padding: 14px;">
        <div class="p1-panel p1-scan">
          <div class="p1-row">
            <div>
              <div class="p1-label">Logged in as</div>
              <div style="font-weight:900; letter-spacing:0.05em;">
                ${escapeHtml(profile?.username ?? "UNKNOWN")}
                <span style="opacity:0.7; font-weight:700; font-size:12px;">
                  ${profile?.role ? `(${escapeHtml(profile.role)})` : ""}
                </span>
              </div>
            </div>
            <button id="logout" class="p1-btn">Logout</button>
          </div>
        </div>

        <div class="p1-grid" style="margin-top:12px;">
          <div class="p1-panel p1-scan">
            <div class="p1-row">
              <div class="p1-stat">
                <div class="p1-label">Signal</div>
                <div id="signal" class="p1-value">0</div>
              </div>
              <div class="p1-stat" style="text-align:right;">
                <div class="p1-label">Signal/sec</div>
                <div id="sps" class="p1-value">0</div>
              </div>
              <div class="p1-stat" style="text-align:right;">
                <div class="p1-label">Ping Power</div>
                <div id="pingPower" class="p1-value">0</div>
              </div>
              <div class="p1-stat" style="min-width:220px;">
                <div class="p1-label">Corruption</div>
                <div style="display:flex; align-items:center; gap:10px;">
                  <div class="p1-bar" style="flex:1;"><div id="corrFill" class="p1-fill"></div></div>
                  <div id="corrText" style="width:54px; text-align:right; font-weight:900;">0%</div>
                </div>
              </div>
            </div>

            <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
              <button id="ping" class="p1-btn" style="flex:1; min-width:160px;">Ping</button>
              <button id="purge" class="p1-btn" style="flex:1; min-width:160px;">Purge</button>
            </div>
            <div id="hint" style="margin-top:8px; font-size:12px; opacity:0.85;"></div>
          </div>

          <div class="p1-two">
            <div class="p1-panel p1-scan">
              <div class="p1-title">SCOPE</div>
              <div id="scope" class="p1-mono" style="margin-top:8px; font-size:12px; opacity:0.9; white-space:pre;"></div>
            </div>

            <div class="p1-panel p1-scan">
              <div class="p1-title">OSC</div>
              <div id="osc" class="p1-mono" style="margin-top:8px; font-size:12px; opacity:0.9; white-space:pre;"></div>
            </div>
          </div>

          <div class="p1-panel p1-scan">
            <div class="p1-title">UPGRADES</div>
            <div style="opacity:0.8; font-size:12px; margin-top:6px;">
              Buy systems to grow Signal and fight Corruption.
            </div>
            <div id="shop" style="margin-top:10px; display:grid; gap:10px;"></div>
          </div>

          <div class="p1-panel p1-scan">
            <div class="p1-title">COMMS + TRANSMISSION</div>
            <div class="p1-logs" style="margin-top:10px;">
              <div>
                <div style="font-weight:900; font-size:12px; opacity:0.85;">COMMS</div>
                <div id="commsBox" class="p1-logbox p1-mono"></div>
              </div>
              <div>
                <div style="font-weight:900; font-size:12px; opacity:0.85;">TRANSMISSION</div>
                <div id="txBox" class="p1-logbox p1-mono"></div>
              </div>
            </div>
          </div>

          <div class="p1-panel p1-scan" style="display:${isDev ? "block" : "none"};">
            <div class="p1-title">DEV</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
              <button id="wipe" class="p1-btn">Wipe my save</button>
              <button id="grant" class="p1-btn">+1,000 signal</button>
              <button id="grantBig" class="p1-btn">+50,000 signal</button>
            </div>
            <div id="devMsg" style="margin-top:10px; font-size:12px; opacity:0.9;"></div>
          </div>

          <div id="offlineOverlay" style="display:none; position:fixed; inset:0; background: rgba(5,7,10,0.92); padding:14px;">
            <div class="p1-panel p1-scan" style="max-width:720px; margin: 0 auto;">
              <div class="p1-title">RETURN REPORT</div>
              <div id="offlineBody" style="margin-top:10px; font-size:14px; opacity:0.92;"></div>
              <button id="offlineAck" class="p1-btn" style="margin-top:12px; width:100%;">ACK</button>
            </div>
          </div>

          <div id="defeatOverlay" style="display:none; position:fixed; inset:0; background: rgba(5,7,10,0.94); padding:14px;">
            <div class="p1-panel p1-scan" style="max-width:720px; margin: 0 auto;">
              <div class="p1-title">SYSTEM FAILURE</div>
              <div id="defeatBody" style="margin-top:10px; font-size:14px; opacity:0.92;"></div>
              <button id="restart" class="p1-btn" style="margin-top:12px; width:100%;">RESTART PHASE</button>
            </div>
          </div>

        </div>
      </div>
    `;

    const $signal = root.querySelector("#signal");
    const $sps = root.querySelector("#sps");
    const $pingPower = root.querySelector("#pingPower");
    const $corrFill = root.querySelector("#corrFill");
    const $corrText = root.querySelector("#corrText");
    const $shop = root.querySelector("#shop");
    const $comms = root.querySelector("#commsBox");
    const $tx = root.querySelector("#txBox");
    const $scope = root.querySelector("#scope");
    const $osc = root.querySelector("#osc");
    const $hint = root.querySelector("#hint");

    root.querySelector("#logout").onclick = async () => {
      await api.supabase.auth.signOut();
    };

    function renderWave(width, height, phase, amp) {
      const rows = [];
      for (let y = 0; y < height; y++) {
        let line = "";
        for (let x = 0; x < width; x++) {
          const t = (x / width) * Math.PI * 2;
          const v = Math.sin(t * 1.7 + phase) * amp + Math.sin(t * 0.6 + phase * 0.4) * (amp * 0.4);
          const yy = Math.floor(((v + 1) / 2) * (height - 1));
          line += (height - 1 - y === yy) ? "█" : "·";
        }
        rows.push(line);
      }
      return rows.join("\n");
    }

    function renderShop() {
      const st = api.getState();
      const p1 = st.phases.phase1;
      p1.upgrades ??= { spsBoost: 0, pingBoost: 0, spsMult: 0, noiseCanceller: 0, purgeEfficiency: 0 };

      $shop.innerHTML = "";

      for (const def of UPGRADE_DEFS) {
        const lvl = p1.upgrades[def.id] || 0;
        const cost = costFor(def.base, def.growth, lvl);
        const canBuy = (p1.signal || 0) >= cost;

        const row = document.createElement("div");
        row.style.border = "1px solid rgba(215,255,224,0.12)";
        row.style.borderRadius = "12px";
        row.style.padding = "12px";
        row.style.background = "rgba(5,7,10,0.32)";
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap;">
            <div style="min-width: 240px;">
              <div style="font-weight:900; letter-spacing:0.03em;">${escapeHtml(def.name)}</div>
              <div style="opacity:0.82; font-size:12px; margin-top:4px;">${escapeHtml(def.desc)}</div>
              <div style="opacity:0.92; font-size:12px; margin-top:6px;">
                Level <b>${lvl}</b> → ${escapeHtml(def.effectText(lvl))}
              </div>
            </div>

            <div style="text-align:right;">
              <div style="opacity:0.75; font-size:12px;">Cost</div>
              <div style="font-weight:900; font-size:18px;">${nfmt(cost)}</div>
              <button data-buy="${def.id}" ${canBuy ? "" : "disabled"} class="p1-btn"
                style="margin-top:6px; ${canBuy ? "" : "opacity:0.55;"}">
                Buy
              </button>
            </div>
          </div>
        `;
        row.querySelector(`[data-buy="${def.id}"]`).onclick = () => buy(def.id);
        $shop.appendChild(row);
      }
    }

    function buy(upgradeId) {
      const st = api.getState();
      const p1 = st.phases.phase1;
      p1.upgrades ??= { spsBoost: 0, pingBoost: 0, spsMult: 0, noiseCanceller: 0, purgeEfficiency: 0 };

      const def = UPGRADE_DEFS.find((u) => u.id === upgradeId);
      if (!def) return;

      const lvl = p1.upgrades[upgradeId] || 0;
      const nextLvl = lvl + 1;
      const cost = costFor(def.base, def.growth, lvl);

      if ((p1.signal || 0) < cost) return;

      p1.signal -= cost;
      def.apply(p1, nextLvl);

      pushLog(p1.transmission, `UPGRADE//ACQUIRED  ${def.name} → Level ${nextLvl}`);
      api.setState(st);
      api.saveSoon();
      render();
    }

    function doPurge() {
      const st = api.getState();
      const p1 = st.phases.phase1;

      if (p1.isDefeated) return;

      const cost = purgeCost(p1);
      if ((p1.signal || 0) < cost) return;

      const amt = purgeAmount(p1);
      p1.signal -= cost;
      p1.corruption = clamp((p1.corruption || 0) - amt, 0, 100);

      pushLog(p1.transmission, `PURGE//EXEC  -${Math.floor(amt)}% corruption`);
      api.setState(st);
      api.saveSoon();
      render();
    }

    root.querySelector("#ping").onclick = () => {
      const st = api.getState();
      const p1 = st.phases.phase1;
      if (p1.isDefeated) return;

      p1.signal += p1.pingPower || 5;

      // Ping creates "noise": small corruption bump if you spam it
      p1.corruption = clamp((p1.corruption || 0) + 0.25, 0, 100);

      api.setState(st);
      api.saveSoon();
      render();
    };

    root.querySelector("#purge").onclick = () => doPurge();

    // Dev tools (no admin functions)
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
    }

    // Offline overlay (ACK)
    const offlineOverlay = root.querySelector("#offlineOverlay");
    const offlineBody = root.querySelector("#offlineBody");
    const offlineAck = root.querySelector("#offlineAck");

    const st0 = api.getState();
    if (st0.meta.offlineNeedsAck && (st0.meta.offlineSummary || []).length) {
      const items = st0.meta.offlineSummary.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
      offlineBody.innerHTML = `<ul style="margin:0; padding-left:18px;">${items}</ul>`;
      offlineOverlay.style.display = "block";

      offlineAck.onclick = () => {
        const st = api.getState();
        st.meta.offlineNeedsAck = false;
        st.meta.offlineSummary = [];
        api.setState(st);
        api.saveSoon();
        offlineOverlay.style.display = "none";
      };
    }

    // Defeat overlay
    const defeatOverlay = root.querySelector("#defeatOverlay");
    const defeatBody = root.querySelector("#defeatBody");
    const restartBtn = root.querySelector("#restart");

    restartBtn.onclick = () => {
      const st = api.getState();
      const p1 = st.phases.phase1;

      p1.isDefeated = false;
      p1.corruption = 0;
      p1.signal = 0;
      p1.signalPerSecond = 1;
      p1.pingPower = 5;
      p1.upgrades = { spsBoost: 0, pingBoost: 0, spsMult: 0, noiseCanceller: 0, purgeEfficiency: 0 };
      p1.comms = [];
      p1.transmission = [];
      pushLog(p1.comms, "CONTROL//RETURN  Signal lock re-established. Phase restarted.");
      pushLog(p1.comms, "CONTROL//NOTE  Corruption present. Maintain integrity.");

      api.setState(st);
      api.saveSoon();
      defeatOverlay.style.display = "none";
      render();
    };

    function maybeWarn(p1) {
      const c = p1.corruption || 0;
      if (c >= 25 && !p1._warn25) { p1._warn25 = true; pushLog(p1.comms, "CONTROL//WARN  Corruption rising. Consider Noise Canceller."); }
      if (c >= 50 && !p1._warn50) { p1._warn50 = true; pushLog(p1.comms, "CONTROL//WARN  Integrity degraded. Purge recommended."); }
      if (c >= 75 && !p1._warn75) { p1._warn75 = true; pushLog(p1.comms, "CONTROL//ALERT  Critical corruption. Immediate action required."); }
    }

    function render() {
      const st = api.getState();
      const p1 = st.phases.phase1;

      $signal.textContent = nfmt(p1.signal);
      $sps.textContent = (p1.signalPerSecond || 0).toFixed(2);
      $pingPower.textContent = nfmt(p1.pingPower || 5);

      const c = clamp(p1.corruption || 0, 0, 100);
      $corrText.textContent = fmtPct(c);
      $corrFill.style.width = `${c}%`;

      const rate = computeCorruptionRate(p1);
      const purgeC = purgeCost(p1);
      const purgeA = purgeAmount(p1);

      $hint.textContent = `Corruption rate: ${rate.toFixed(2)}/s • Purge: -${Math.floor(purgeA)}% for ${nfmt(purgeC)} signal`;

      renderShop();

      $comms.textContent = (p1.comms || []).join("\n");
      $tx.textContent = (p1.transmission || []).join("\n");

      // Tiny “scope” toys (purely visual)
      const ph = (Date.now() / 500) % (Math.PI * 2);
      const amp = clamp((p1.signalPerSecond || 1) / 20, 0.15, 1.0);
      $scope.textContent = renderWave(64, 8, ph, amp);
      $osc.textContent = renderWave(24, 8, ph * 1.4, amp * 0.9);

      // Defeat overlay
      if (p1.isDefeated) {
        defeatBody.innerHTML = `
          <div style="opacity:0.9;">
            Corruption reached <b>100%</b>.
            Your systems went dark.
          </div>
          <div style="margin-top:8px; font-size:13px; opacity:0.85;">
            Tip: Noise Canceller slows corruption. Purge burns signal to reduce it.
          </div>
        `;
        defeatOverlay.style.display = "block";
      }
    }

    // Initial render
    render();

    // Repaint loop (battery-friendly)
    const repaint = setInterval(() => {
      render();
      const st = api.getState();
      maybeWarn(st.phases.phase1);
    }, 500);

    this._cleanup = () => clearInterval(repaint);
  },

  unmount() {
    if (this._cleanup) this._cleanup();
  },

  tick({ state, dtMs }) {
    if (state.isDefeated) return { state };

    // Signal gain
    const sps = state.signalPerSecond || 0;
    state.signal = (state.signal || 0) + sps * (dtMs / 1000);

    // Corruption pressure
    const rate = computeCorruptionRate(state);
    state.corruption = clamp((state.corruption || 0) + rate * (dtMs / 1000), 0, 100);

    if (state.corruption >= 100) {
      state.isDefeated = true;
    }

    return { state };
  },

  applyOfflineProgress({ state, dtMs }) {
    // If offline for almost nothing, skip
    if (dtMs < 1000) return { state, summary: [] };

    if (state.isDefeated) {
      return {
        state,
        summary: [
          `Offline for ${fmtMs(dtMs)}`,
          `Systems were already down (corruption maxed).`,
        ],
      };
    }

    const beforeSignal = state.signal || 0;
    const beforeCorr = state.corruption || 0;

    const sps = state.signalPerSecond || 0;
    const gain = sps * (dtMs / 1000);
    state.signal = beforeSignal + gain;

    const rate = computeCorruptionRate(state);
    state.corruption = clamp(beforeCorr + rate * (dtMs / 1000), 0, 100);

    let defeated = false;
    if (state.corruption >= 100) {
      state.isDefeated = true;
      defeated = true;
    }

    const summary = [
      `Offline for ${fmtMs(dtMs)}`,
      `Generated +${Math.floor(gain)} signal`,
      `Corruption: ${Math.floor(beforeCorr)}% → ${Math.floor(state.corruption)}%`,
    ];

    if (defeated) summary.push(`SYSTEM FAILURE occurred while offline.`);

    return { state, summary };
  },
};
