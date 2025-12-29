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

let _popupHook = null; // set by phase UI

function nowStamp() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}


function maybePopupFromLine(line) {
  if (!_popupHook) return;
  // Format: SPEAKER//POPUP  message...
  const m = String(line).match(/^([A-Z0-9 _-]{2,18})\/\/\s*POPUP\s+(.*)$/i);
  if (!m) return;
  const speaker = m[1].trim().toUpperCase();
  const msg = m[2].trim();
  _popupHook(speaker, msg);
}

function pushLog(arr, line, max = 60) {
  arr.push(`[${nowStamp()}] ${line}`);
  while (arr.length > max) arr.shift();
  maybePopupFromLine(line);
}

function attachFastTap(el, handler) {
  if (!el) return;

  el.addEventListener("click", (e) => {
    if (el.__fastTapFired) {
      el.__fastTapFired = false;
      return;
    }
    handler(e);
  });

  el.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "touch") {
        e.preventDefault();
        el.__fastTapFired = true;
        handler(e);
      }
    },
    { passive: false }
  );
}

function attachHoldPing(btn, doPing, getRate, canHold) {
  if (!btn) return () => {};
  let holding = false;
  let timer = 0;

  const stop = () => {
    holding = false;
    try { onHoldChange?.(false); } catch {}
    if (timer) clearInterval(timer);
    timer = 0;
  };

  const start = (e) => {
    // prevent iOS text selection/callout
    e.preventDefault();
    e.stopPropagation();
    if (holding) return;
    holding = true;
    try { onHoldChange?.(true); } catch {}

    try { btn.setPointerCapture?.(e.pointerId); } catch {}

    // immediate tick
    onTick(true);

    const interval = Math.max(25, Math.floor(getIntervalMs()));
    timer = setInterval(() => {
      if (!holding) return;
      onTick(true);
    }, interval);
  };

  btn.style.touchAction = "manipulation";
  btn.style.webkitUserSelect = "none";
  btn.style.userSelect = "none";
  btn.style.webkitTouchCallout = "none";

  // IMPORTANT: pointerdown must be non-passive so preventDefault works on iOS
  btn.addEventListener("pointerdown", start, { passive: false });
  btn.addEventListener("pointerup", stop, { passive: true });
  btn.addEventListener("pointercancel", stop, { passive: true });
  btn.addEventListener("pointerleave", stop, { passive: true });

  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); });

  return stop;
}



function fireMilestone(p1, key, channel, line) {
  p1.flags ??= {};
  if (p1.flags[key]) return false;
  p1.flags[key] = true;
  if (channel === "comms") pushLog(p1.comms, line);
  else pushLog(p1.transmission, line);
  return true;
}

function processMilestones(p1) {
  // Signal beats
  const s = p1.signal || 0;
  if (s >= 250)  fireMilestone(p1, "sig250", "comms", "CONTROL//NOTE  Minimal lock achieved. Keep pressure steady.");
  if (s >= 1000) fireMilestone(p1, "sig1k", "transmission", "OPS//UPDATE  Signal is climbing. Instruments look… less angry.");
  if (s >= 5000) fireMilestone(p1, "sig5k", "comms", "CONTROL//WARN  High gain detected. Corruption will respond.");
  if (s >= (TUNE.winSignal || 12000)) fireMilestone(p1, "sigWin", "transmission", "OPS//MARK  Win threshold reached. Hold stability.");

  // First upgrade / purge
  const upgradesOwned =
    (p1.upgrades?.noiseCanceller || 0) > 0 ||
    (p1.upgrades?.purgeEfficiency || 0) > 0 ||
    (p1.upgrades?.spsBoost || 0) > 0 ||
    (p1.upgrades?.pingBoost || 0) > 0 ||
    (p1.upgrades?.spsMult || 0) > 0;

  if (upgradesOwned) fireMilestone(p1, "firstUpgrade", "transmission", "MORRIS HARDY//OPS  There. Hear that? That's the sound of not doing everything yourself.");

  if ((p1.stats?.purges || 0) > 0) fireMilestone(p1, "firstPurge", "comms", "CONTROL//RETURN  Purge cycle responded. Temporary integrity restored.");

  // Stabilisation window
  if (isWinStable(p1)) fireMilestone(p1, "stabiliseWindow", "comms", "CONTROL//LOCK  Stabilisation window open. Maintain parameters for 10 seconds.");
}

const UPGRADE_DEFS = [

  {
    id: "holdPing",
    name: "Hold-Press Actuator",
    desc: "Unlock press-and-hold Ping (auto-ping). Builds fatigue.",
    requiresSignal: 50,
    base: 15,
    growth: 99,
    effectText: (lvl) => (lvl >= 1 ? "UNLOCKED" : "Unlock hold Ping"),
    apply: (p1, nextLvl) => {
      p1.upgrades.holdPing = 1;
      pushLog(p1.comms, "CONTROL//POPUP  Hold-Press Actuator online. Maintain pressure, manage fatigue.");
    },
  },
  {
    id: "fatigueCooler",
    name: "Thermal Bleed Valve",
    desc: "Fatigue cools off faster between holds.",
    base: 60,
    growth: 1.7,
    effectText: (lvl) => `+${((lvl + 1) * 20)}% cooloff`,
    apply: (p1, nextLvl) => {
      p1.upgrades.fatigueCooler = nextLvl;
      pushLog(p1.comms, "OPS//POPUP  Thermal Bleed Valve installed. Fatigue venting improved.");
    },
  },

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
  const base = Number(p1.baseCorruptionRate ?? TUNE.baseCorruptionRate);

  const noiseLvl = p1.upgrades?.noiseCanceller || 0;
  const noiseReduction = clamp(noiseLvl * 0.08, 0, 0.75); // up to 75%

  // Small scaling with progression so it becomes a "late phase" fight
  const scale = clamp((p1.signal || 0) / 100000, 0, 2.0); // 0..2
  const scaledAdd = 0.06 * scale;

  return base * (1 - noiseReduction) + scaledAdd;
}

function purgeCost(p1) {
  const lvl = p1.upgrades?.purgeEfficiency || 0;
  const reduction = clamp(lvl * TUNE.purgeCostReductionPerLvl, 0, 0.6);
  return Math.floor(TUNE.purgeBaseCost * (1 - reduction));
}

function purgeAmount(p1) {
  const lvl = p1.upgrades?.purgeEfficiency || 0;
  const mult = 1 + lvl * TUNE.purgePowerPerLvl;
  return TUNE.purgeBaseAmount * mult; // percentage points
}

// "Alien tension" win condition:
// - Signal ≥ 12,000
// - Corruption ≤ 40%
// - Own at least one defensive upgrade (Noise Canceller OR Purge Manifold)
// - Maintain stability for 10 seconds
// Central tuning block (Phase-local). Keep numbers here so balancing is painless.
const TUNE = {
  // Win condition ("Alien tension")
  winSignal: 12000,
  winCorruptionMax: 40,
  winHoldMs: 10_000,

  // Corruption system
  baseCorruptionRate: 0.18,     // per second
  signalScaleForPressure: 100000, // signal at which extra pressure ramps
  pressureAddPerScale: 0.06,    // extra corruption per second per scale unit (scale 0..2)

  // Interaction noise
  pingCorruptionNoise: 0.25,    // corruption added per Ping

  // Purge system
  purgeBaseCost: 60,
  purgeCostReductionPerLvl: 0.07, // up to 60% reduction
  purgeBaseAmount: 18,          // percentage points
  purgePowerPerLvl: 0.10,       // +10% per lvl  // Hold-to-ping balance
  holdFatigueInc: 0.05,
  holdFatigueTapRelief: 0.10,
  holdFatigueDecayPerSec: 0.28,
  holdMinPowerMult: 0.35,
  holdOverheatNoise: 0.12,

};


function isDefensiveReady(p1) {
  const n = p1.upgrades?.noiseCanceller || 0;
  const p = p1.upgrades?.purgeEfficiency || 0;
  return n > 0 || p > 0;
}

function isWinStable(p1) {
  return (
    (p1.signal || 0) >= TUNE.winSignal &&
    (p1.corruption || 0) <= TUNE.winCorruptionMax &&
    isDefensiveReady(p1) &&
    !p1.isDefeated
  );
}

export default {
  id: "phase1",

  mount(root, api) {

    // Time trial / leaderboard helpers (scoped to Phase 1 mount)
    function formatMs(ms) {
      if (ms == null) return "--:--.-";
      const total = Math.max(0, Math.floor(ms));
      const m = Math.floor(total / 60000);
      const s = Math.floor((total % 60000) / 1000);
      const t = Math.floor((total % 1000) / 100);
      return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${t}`;
    }

    async function showLeaderboard(mode) {
      const overlay = root.querySelector("#lbOverlay") || root.querySelector("#leaderboardOverlay");
      if (!overlay) {
        pushLog(api.getState().phases.phase1.comms, "CONTROL//ERR  Leaderboard UI missing.");
        return;
      }
      overlay.style.display = "block";

      const globalBox = overlay.querySelector("#lbGlobal");
      const mineBox = overlay.querySelector("#lbMine");
      if (globalBox) globalBox.style.display = (mode === "global") ? "block" : "none";
      if (mineBox) mineBox.style.display = (mode === "mine") ? "block" : "none";

      try { await refreshLeaderboards(); } catch (e) {}
    }

    const profile = api.getProfile();
    const isDev = profile?.username === "PrymalChaos" || profile?.role === "admin";

    // Backfill state for older saves
    const stInit = api.getState();
    const p1 = (stInit.phases.phase1 ??= {});
    stInit.meta.unlockedPhases ??= { phase1: true, phase2: false };

    p1.signal ??= 0;
    p1.signalPerSecond ??= 1;
    p1.pingPower ??= 5;

    p1.corruption ??= 0;
    p1.baseCorruptionRate ??= TUNE.baseCorruptionRate;
    p1.isDefeated ??= false;

    p1.completed ??= false;
    p1.winHoldMs ??= 0;

    p1.comms ??= [];
    p1.transmission ??= [];
    p1.upgrades ??= { holdPing: 0, fatigueCooler: 0, spsBoost: 0, pingBoost: 0, spsMult: 0, noiseCanceller: 0, purgeEfficiency: 0, autopilotCore: 0 };
            p1.run ??= { state: "running", startedAt: null, completedAt: null };
    if (!p1.run.startedAt) p1.run.startedAt = p1.bootedAt || Date.now();
p1.timeTrial ??= { bestMs: null, lastMs: null, runId: 0, submittedRunId: null };
    p1.win ??= { achieved: false, handled: false, achievedAt: null };
p1.flags ??= {};
    p1.stats ??= { purges: 0, upgradesBought: 0 };

    api.setState(stInit);

    if (p1.comms.length === 0) {
      pushLog(p1.comms, "CONTROL//RETURN  Signal lock established. Phase 1 online.");
      pushLog(p1.comms, "CONTROL//NOTE  Corruption present. Maintain integrity.");
      api.setState(stInit);
      api.saveSoon();
    }

    // Panel-heavy UI, phase-local styling
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
          -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;padding: 10px;
          border-radius: 10px;
          border: 1px solid rgba(215,255,224,0.18);
          background: rgba(5,7,10,0.35);
          color: inherit;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
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
      
        .p1-scopecanvas {
          width: 100%;
          height: 110px;
          display:block;
          border-radius: 12px;
        }
        .p1-osccanvas {
          width: 100%;
          height: 240px;
          display:block;
          border-radius: 12px;
        }
        @media (max-width: 740px){
          .p1-osccanvas { height: 180px; }
        }


        :root { color-scheme: dark; }
        .p1-shell{
          background:
            radial-gradient(1200px 700px at 30% 20%, rgba(120,140,130,0.18), rgba(0,0,0,0) 55%),
            radial-gradient(900px 700px at 80% 70%, rgba(80,100,90,0.14), rgba(0,0,0,0) 60%),
            repeating-linear-gradient(90deg,
              rgba(255,255,255,0.05) 0px,
              rgba(255,255,255,0.00) 2px,
              rgba(0,0,0,0.06) 6px),
            linear-gradient(180deg, rgba(15,18,18,0.95), rgba(6,8,7,0.98));
          min-height: 100vh;
        }

        .p1-panel{
          border: 1px solid rgba(156,255,176,0.18);
          border-radius: 14px;
          background: rgba(6, 10, 8, 0.68);
          padding: 12px;
          position: relative;
          overflow: hidden;
          box-shadow:
            inset 0 0 0 1px rgba(0,0,0,0.50),
            inset 0 0 24px rgba(0,0,0,0.65),
            0 10px 30px rgba(0,0,0,0.45);
          backdrop-filter: blur(2px);
          color: rgba(156,255,176,0.92);
          text-shadow:
            0 0 6px rgba(156,255,176,0.18),
            0 0 14px rgba(156,255,176,0.10);
        }

        .p1-panel.p1-crt:before{
          content:"";
          position:absolute; inset:0;
          background:
            repeating-linear-gradient(to bottom,
              rgba(156,255,176,0.055) 0px,
              rgba(156,255,176,0.025) 1px,
              rgba(0,0,0,0) 3px
            ),
            radial-gradient(110% 85% at 50% 35%,
              rgba(156,255,176,0.08),
              rgba(0,0,0,0) 55%),
            radial-gradient(120% 95% at 50% 55%,
              rgba(0,0,0,0) 35%,
              rgba(0,0,0,0.62) 85%);
          opacity:0.9;
          pointer-events:none;
          mix-blend-mode:screen;
        }
        .p1-panel.p1-crt:after{
          content:"";
          position:absolute; inset:-40px;
          background:
            radial-gradient(closest-side, rgba(156,255,176,0.06), rgba(0,0,0,0) 65%),
            repeating-linear-gradient(0deg,
              rgba(255,255,255,0.00) 0px,
              rgba(255,255,255,0.00) 6px,
              rgba(255,255,255,0.015) 7px);
          opacity:0.22;
          pointer-events:none;
          animation:p1Flicker 6.5s infinite steps(1);
        }
        @keyframes p1Flicker{
          0%{opacity:0.20; transform:translateY(0px);}
          2%{opacity:0.28;}
          3%{opacity:0.17;}
          7%{opacity:0.24; transform:translateY(1px);}
          11%{opacity:0.19;}
          12%{opacity:0.27;}
          60%{opacity:0.21; transform:translateY(0px);}
          61%{opacity:0.26;}
          62%{opacity:0.18;}
          100%{opacity:0.20; transform:translateY(0px);}
        }

        .p1-btn{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;
          border:1px solid rgba(156,255,176,0.22);
          background: linear-gradient(180deg, rgba(10,14,12,0.60), rgba(3,5,4,0.70));
          box-shadow: inset 0 0 0 1px rgba(0,0,0,0.55), inset 0 -10px 18px rgba(0,0,0,0.55);
          -webkit-tap-highlight-color: rgba(0,0,0,0);
          user-select:none;
        }
        .p1-btn:active{ transform: translateY(1px); filter: brightness(1.12); }

        .p1-scopebox{
          border-radius: 14px;
          border: 1px solid rgba(156,255,176,0.16);
          background: rgba(1,3,2,0.62);
          padding: 10px;
          box-shadow: inset 0 0 22px rgba(0,0,0,0.80);
        }
        .p1-curved{ border-radius: 18px; }

        #popupRail{
          position: sticky;
          top: 10px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 10px;
          pointer-events: none;
        }
        .p1-popup{
          pointer-events: auto;
          display:flex;
          gap:10px;
          align-items:flex-start;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(156,255,176,0.22);
          background: rgba(2,4,3,0.72);
          box-shadow: inset 0 0 22px rgba(0,0,0,0.70), 0 12px 26px rgba(0,0,0,0.45);
        }
        .p1-popup .p1-badge{
          width: 28px;
          height: 28px;
          flex: 0 0 28px;
          border-radius: 8px;
          border: 1px solid rgba(156,255,176,0.18);
          background: rgba(1,3,2,0.65);
          box-shadow: inset 0 0 14px rgba(0,0,0,0.65);
        }
        .p1-popup .p1-popmeta{ display:flex; flex-direction:column; gap:2px; }
        .p1-popup .p1-popspeaker{ font-weight:900; letter-spacing:0.10em; font-size:12px; opacity:0.92; }
        .p1-popup .p1-popmsg{ font-size:12px; opacity:0.86; line-height:1.25; }
</style>

      <div class="p1-shell">
      <div style="max-width: 980px; margin: 0 auto; padding: 14px;">
        <div id="popupRail"></div>
        <div class="p1-panel p1-crt">
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
          <div class="p1-panel p1-crt">
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
              <div class="p1-stat" style="min-width:260px;">
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

          <div class="p1-panel p1-crt" style="margin-top:12px;">
            <div class="p1-row" style="justify-content:space-between;">
              <div class="p1-title">TIME TRIAL</div>
              <div class="p1-label" style="opacity:0.75;">PHASE 1</div>
            </div>
            <div class="p1-row" style="margin-top:8px; gap:12px;">
              <div class="p1-stat"><div class="p1-label">RUN</div><div class="p1-value" id="ttRun">00:00.0</div></div>
              <div class="p1-stat"><div class="p1-label">LAST</div><div class="p1-value" id="ttLast">--:--.-</div></div>
              <div class="p1-stat"><div class="p1-label">BEST</div><div class="p1-value" id="ttBest">--:--.-</div></div>
            </div>
          </div>

          <div class="p1-two">
            <div class="p1-panel p1-crt">
              <div class="p1-title">SCOPE</div>
              <div class="p1-scopebox p1-curved"><div class="p1-row" style="justify-content:space-between; align-items:flex-end; gap:12px;"><div style="font-weight:900; letter-spacing:0.08em; font-size:12px; opacity:0.85;">SCOPE</div><div style="font-size:12px; opacity:0.75;">Flow</div></div><canvas id="scopeCanvas" class="p1-scopecanvas"></canvas></div>
            </div>

            <div class="p1-panel p1-crt">
              <div class="p1-title">OSC</div>
              <div class="p1-scopebox p1-curved"><div class="p1-row" style="justify-content:space-between; align-items:flex-end; gap:12px;"><div style="font-weight:900; letter-spacing:0.08em; font-size:12px; opacity:0.85;">OSCILLOSCOPE</div><div style="font-size:12px; opacity:0.75;">Synchronicity <span id="syncPct">0</span>%</div></div><canvas id="oscCanvas" class="p1-osccanvas"></canvas></div>
            </div>
          </div>

          <div id="fatigueHud" class="p1-panel p1-crt" style="display:none; margin-top:12px;">
            <div class="p1-row" style="justify-content:space-between;">
              <div class="p1-title">FATIGUE</div>
              <div class="p1-label" id="fatiguePct" style="opacity:0.85;">0%</div>
            </div>
            <div style="margin-top:10px; height:10px; border:1px solid rgba(215,255,224,0.14); border-radius:999px; overflow:hidden;">
              <div id="fatigueBar" style="height:100%; width:0%; background:rgba(149,255,176,0.35);"></div>
            </div>
            <div class="p1-label" style="margin-top:8px; opacity:0.75;">Holding Ping builds fatigue and heat. Vent with taps, cool with upgrades.</div>
          </div>

          <div class="p1-panel p1-crt">
            <div class="p1-title">UPGRADES</div>
            <div style="opacity:0.8; font-size:12px; margin-top:6px;">
              Buy systems to grow Signal and fight Corruption.
            </div>
            <div id="shop" style="margin-top:10px; display:grid; gap:10px;"></div>
          </div>

          <div class="p1-panel p1-crt">
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

          <div class="p1-panel p1-crt" style="display:${isDev ? "block" : "none"};">
            <div class="p1-title">DEV</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
              <button id="wipe" class="p1-btn">Wipe my save</button>
              <button id="grant" class="p1-btn">+1,000 signal</button>
              <button id="grantBig" class="p1-btn">+50,000 signal</button>
              <button id="goP2" class="p1-btn">Go Phase 2</button>
            </div>
            
            <div style="margin-top:10px; border-top:1px solid rgba(215,255,224,0.12); padding-top:10px;">
              <button id="telemetryToggle" class="p1-btn" style="width:100%;">Telemetry (dev)</button>
              <div id="telemetryBox" class="p1-mono" style="display:none; margin-top:10px; border-radius:10px; border:1px solid rgba(215,255,224,0.12); background: rgba(5,7,10,0.30); padding:10px; font-size:12px; white-space:pre-wrap;"></div>
            </div>

            <div id="devMsg" style="margin-top:10px; font-size:12px; opacity:0.9;"></div>
          </div>

          <div id="offlineOverlay" style="display:none; position:fixed; inset:0; background: rgba(5,7,10,0.92); padding:14px;">
            <div class="p1-panel p1-crt" style="max-width:720px; margin: 0 auto;">
              <div class="p1-title">RETURN REPORT</div>
              <div id="offlineBody" style="margin-top:10px; font-size:14px; opacity:0.92;"></div>
              <button id="offlineAck" class="p1-btn" style="margin-top:12px; width:100%;">ACK</button>
            </div>
          </div>

          <div id="defeatOverlay" style="display:none; position:fixed; inset:0; background: rgba(5,7,10,0.94); padding:14px;">
            <div class="p1-panel p1-crt" style="max-width:720px; margin: 0 auto;">
              <div class="p1-title">SYSTEM FAILURE</div>
              <div id="defeatBody" style="margin-top:10px; font-size:14px; opacity:0.92;"></div>
              <button id="restart" class="p1-btn" style="margin-top:12px; width:100%;">RESTART PHASE</button>
            </div>
          </div>

          <div id="lbOverlay" style="display:none; position:fixed; inset:0; z-index:1100; background:rgba(0,0,0,0.65); padding:16px;">
        <div class="p1-panel p1-crt" style="max-width:520px; margin:60px auto 0; padding:16px;">
          <div class="p1-title">LEADERBOARDS</div>
          <div style="display:flex; gap:10px; margin-top:10px;">
            <button id="lbGlobalBtn" class="p1-btn" style="flex:1;">GLOBAL TOP 10</button>
            <button id="lbMeBtn" class="p1-btn" style="flex:1;">MY TOP 10</button>
          </div>
          <div id="lbStatus" style="margin-top:10px; font-size:12px; opacity:0.8;"></div>
          <div id="lbList" class="p1-logbox" style="margin-top:10px; height:260px;"></div>
          <button id="lbClose" class="p1-btn" style="margin-top:12px; width:100%;">CLOSE</button>
        </div>
      </div>

<div id="winOverlay" style="display:none; position:fixed; inset:0; background: rgba(5,7,10,0.94); padding:14px;">
            <div class="p1-panel p1-crt" style="max-width:760px; margin: 0 auto;">
              <div class="p1-title">STABILISATION ACHIEVED</div>
              <div id="winBody" style="margin-top:10px; font-size:14px; opacity:0.92;"></div>
              <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
                <button id="continue" class="p1-btn" style="flex:1; min-width:180px;">CONTINUE TO PHASE 2</button>
                <button id="stay" class="p1-btn" style="flex:1; min-width:180px;">STAY IN PHASE 1</button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
    `;


    // Bottom leaderboard buttons
    attachFastTap(root.querySelector("#lbGlobalBtn"), () => showLeaderboard("global"));
    attachFastTap(root.querySelector("#lbMineBtn"), () => showLeaderboard("mine"));


    const $signal = root.querySelector("#signal");
    const $sps = root.querySelector("#sps");
    const $pingPower = root.querySelector("#pingPower");
    const $corrFill = root.querySelector("#corrFill");
    const $corrText = root.querySelector("#corrText");
    const $shop = root.querySelector("#shop");
    const $comms = root.querySelector("#commsBox");

    const $popupRail = root.querySelector("#popupRail");
    const popState = { items: [], max: 3, lastAnyAt: 0, lastByKey: new Map(), minGapMs: 900, perKeyMs: 12000 };

    function hash32(str) {
      let h = 2166136261 >>> 0;
      for (let i=0;i<str.length;i++){
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    function drawBadge(canvas, seedStr) {
      const c = canvas;
      const ctx = c.getContext("2d");
      const seed = hash32(seedStr);
      // pixel grid 8x8 inside 24x24
      const W = 24, H = 24;
      c.width = W; c.height = H;
      ctx.clearRect(0,0,W,H);

      // background
      ctx.fillStyle = "rgba(1,3,2,0.95)";
      ctx.fillRect(0,0,W,H);

      // border glow
      ctx.strokeStyle = "rgba(156,255,176,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5,0.5,W-1,H-1);

      // deterministic PRNG
      let s = seed || 1;
      const rnd = () => {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return (s >>> 8) / 16777216;
      };

      const fg = "rgba(156,255,176,0.92)";
      const mid = "rgba(156,255,176,0.55)";

      // face mask (symmetrical)
      const px = 2, py = 2, cell = 2; // 8x8 => 16x16 area
      for (let y=0;y<8;y++){
        for (let x=0;x<4;x++){
          const r = rnd();
          const on = r > 0.55;
          const shade = r > 0.82 ? fg : mid;
          if (on){
            ctx.fillStyle = shade;
            ctx.fillRect(px + x*cell, py + y*cell, cell, cell);
            ctx.fillRect(px + (7-x)*cell, py + y*cell, cell, cell);
          }
        }
      }

      // “visor” band
      ctx.fillStyle = "rgba(1,3,2,0.70)";
      ctx.fillRect(2, 8, 20, 4);
      ctx.fillStyle = "rgba(156,255,176,0.45)";
      ctx.fillRect(3, 9, 18, 2);

      // little ID dot
      ctx.fillStyle = "rgba(156,255,176,0.65)";
      ctx.fillRect(18, 18, 3, 3);

      // phosphor bloom
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "rgba(156,255,176,0.35)";
      ctx.fillRect(1,1,W-2,H-2);
      ctx.globalAlpha = 1;
    }

    function showPopup(speaker, msg) {
      if (!$popupRail) return;

      const now = Date.now();
      const key = `${String(speaker)}::${String(msg)}`.slice(0, 180);
      const lastKey = popState.lastByKey.get(key) || 0;
      if (now - lastKey < popState.perKeyMs) return;
      if (now - (popState.lastAnyAt || 0) < popState.minGapMs) return;
      popState.lastAnyAt = now;
      popState.lastByKey.set(key, now);
      const el = document.createElement("div");
      el.className = "p1-popup";

      const badge = document.createElement("canvas");
      badge.className = "p1-badge";
      drawBadge(badge, speaker);

      const meta = document.createElement("div");
      meta.className = "p1-popmeta";

      const sp = document.createElement("div");
      sp.className = "p1-popspeaker";
      sp.textContent = speaker;

      const ms = document.createElement("div");
      ms.className = "p1-popmsg";
      ms.textContent = msg;

      meta.appendChild(sp);
      meta.appendChild(ms);

      el.appendChild(badge);
      el.appendChild(meta);

      el.addEventListener("click", () => el.remove());

      // queue
      $popupRail.prepend(el);
      popState.items.unshift(el);

      while (popState.items.length > popState.max) {
        const old = popState.items.pop();
        if (old && old.remove) old.remove();
      }

      setTimeout(() => {
        if (el && el.parentNode) el.remove();
        popState.items = popState.items.filter(x => x !== el);
      }, 3200);
    }

    // wire popup hook for pushLog/fireMilestone
    _popupHook = (speaker, msg) => showPopup(speaker, msg);


    const $tx = root.querySelector("#txBox");
    
    const $scopeCanvas = root.querySelector("#scopeCanvas");
    const $oscCanvas = root.querySelector("#oscCanvas");
    const $syncPct = root.querySelector("#syncPct");

    const $ttClock = root.querySelector("#ttClock");
    const $ttBest = root.querySelector("#ttBest");
    const $ttLast = root.querySelector("#ttLast");

    const $lbOverlay = root.querySelector("#lbOverlay");
    const $lbGlobalBtn = root.querySelector("#lbGlobalBtn");
    const $lbMeBtn = root.querySelector("#lbMeBtn");
    const $lbClose = root.querySelector("#lbClose");
    const $lbStatus = root.querySelector("#lbStatus");
    const $lbList = root.querySelector("#lbList");

    // Transient visuals (not saved)
    const vis = {
      t: 0,
      lastPingAt: 0,
      shake: 0,
    };

    function sizeCanvas(c) {
      if (!c) return;
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

      // getBoundingClientRect() can be 0 on iOS during initial layout; fall back to offset sizes
      const rect = c.getBoundingClientRect();
      const cssW = Math.max(10, Math.floor(rect.width || c.offsetWidth || (c.parentElement ? c.parentElement.clientWidth : 0) || 320));
      const cssH = Math.max(10, Math.floor(rect.height || c.offsetHeight || 120));

      const pxW = Math.max(10, Math.floor(cssW * dpr));
      const pxH = Math.max(10, Math.floor(cssH * dpr));

      if (c.width !== pxW || c.height !== pxH) {
        c.width = pxW;
        c.height = pxH;
      }

      const ctx = c.getContext("2d");
      if (!ctx) return;

      // draw in CSS pixel coordinates
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      return { ctx, w: cssW, h: cssH, dpr };
    }

    function drawScope(p1, dt) {
      if (!$scopeCanvas) return;
      const s = sizeCanvas($scopeCanvas);
      if (!s) return;
      const { ctx, w, h } = s;

      // Background
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle = "rgba(1,3,2,0.15)";
      ctx.fillRect(0,0,w,h);

      if (isDev) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = "rgba(156,255,176,0.65)";
        ctx.font = "10px ui-monospace, Menlo, Monaco, Consolas, monospace";
        ctx.fillText(`SCOPE ${Math.floor(w)}x${Math.floor(h)}`, 8, 14);
        ctx.restore();
      }

      // Grid
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = "rgba(156,255,176,0.35)";
      ctx.lineWidth = 1;
      const gx = 28, gy = 18;
      for (let x=0; x<=w; x+=gx){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
      for (let y=0; y<=h; y+=gy){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

      // Parameters
      const sps = p1.signalPerSecond || 0;
      const corr = p1.corruption || 0;

      // Base amplitude responds to SPS; corruption adds instability.
      const amp = Math.min(1, 0.20 + (sps / 30) * 0.55 + (corr / 100) * 0.35);
      const noise = (corr / 100) * 0.65;

      // Ping “kick” makes a temporary spike/noise burst
      const sincePing = (Date.now() - vis.lastPingAt) / 1000;
      const kick = Math.max(0, 1 - sincePing * 4); // fades in ~0.25s
      const kickAmp = kick * (0.35 + 0.25 * (vis.shake || 0));

      // Draw waveform
      const mid = h * 0.5;
      const A = (h * 0.40) * amp;
      vis.t += dt * (0.8 + sps / 25); // speed scales with SPS

      ctx.globalAlpha = 1;

      // Debug label (helps confirm canvas is alive)
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = "rgba(156,255,176,0.85)";
      ctx.font = "12px ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace";
      ctx.fillText(`SCOPE ${Math.floor(w)}x${Math.floor(h)}`, 10, 18);
      ctx.restore();
      ctx.strokeStyle = "rgba(156,255,176,0.85)";
      ctx.shadowColor = "rgba(156,255,176,0.35)";
      ctx.shadowBlur = 10;
      ctx.lineWidth = 1.6;

      ctx.beginPath();
      for (let x=0; x<w; x++) {
        const u = x / w;
        const base = Math.sin(vis.t + u * Math.PI * 4);
        const wobble = Math.sin(vis.t * 0.8 + u * Math.PI * 10) * noise * 0.35;
        const rnd = (Math.sin((vis.t*6) + u*80) + Math.sin((vis.t*9.2) + u*140)) * 0.5;
        const n = rnd * noise * 0.10;
        const y = mid + (base + wobble + n) * A + (base * A * kickAmp);
        if (x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();

      // Secondary trace (faint)
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.30;
      ctx.strokeStyle = "rgba(156,255,176,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x=0; x<w; x++) {
        const u = x / w;
        const y = mid + Math.sin(vis.t*0.92 + u*Math.PI*3.6 + 0.8) * (A*0.55);
        if (x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();

      ctx.globalAlpha = 1;
    }

    
    function drawFatigueMeter(p1) {
      const c = root.querySelector("#fatigueMeter");
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;

      const w = c.width, h = c.height;
      ctx.clearRect(0,0,w,h);

      const f = clamp((p1.hold?.fatigue || 0), 0, 1);

      const cx = w * 0.5;
      const cy = h * 0.95;
      const r  = Math.min(w, h) * 0.85;

      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 1.05, Math.PI * 1.95);
      ctx.strokeStyle = "rgba(215,255,224,0.25)";
      ctx.stroke();

      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 2;
      for (let i=0;i<=10;i++){
        const t = i/10;
        const a = Math.PI * (1.05 + 0.90 * t);
        const x1 = cx + Math.cos(a) * (r-14);
        const y1 = cy + Math.sin(a) * (r-14);
        const x2 = cx + Math.cos(a) * (r-4);
        const y2 = cy + Math.sin(a) * (r-4);
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2);
        ctx.strokeStyle = "rgba(215,255,224,0.28)";
        ctx.stroke();
      }

      const a = Math.PI * (1.05 + 0.90 * f);
      const nx = cx + Math.cos(a) * (r-18);
      const ny = cy + Math.sin(a) * (r-18);

      ctx.globalAlpha = 0.90;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.strokeStyle = "rgba(215,255,224,0.95)";
      ctx.stroke();

      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI*2);
      ctx.fillStyle = "rgba(215,255,224,0.55)";
      ctx.fill();

      const etaEl = root.querySelector("#fatigueEta");
      if (etaEl) {
        const lvl = (p1.upgrades?.fatigueCooler || 0);
        const mult = 1 + lvl * 0.20;
        const decay = TUNE.holdFatigueDecayPerSec * mult;
        const secs = decay > 0 ? (f / decay) : 0;
        if (f < 0.02) etaEl.textContent = "COOL";
        else if (secs < 60) etaEl.textContent = `${Math.ceil(secs)}s`;
        else etaEl.textContent = `${Math.ceil(secs/60)}m`;
      }
    }

function drawOsc(p1, dt) {
      if (!$oscCanvas) return;
      const s = sizeCanvas($oscCanvas);
      if (!s) return;
      const { ctx, w, h } = s;

      ctx.clearRect(0,0,w,h);
      ctx.fillStyle = "rgba(1,3,2,0.15)";
      ctx.fillRect(0,0,w,h);

      if (isDev) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = "rgba(156,255,176,0.65)";
        ctx.font = "10px ui-monospace, Menlo, Monaco, Consolas, monospace";
        ctx.fillText(`SCOPE ${Math.floor(w)}x${Math.floor(h)}`, 8, 14);
        ctx.restore();
      }

      // Grid (circle-friendly)
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = "rgba(156,255,176,0.35)";
      ctx.lineWidth = 1;
      const step = 26;
      for (let x=0; x<=w; x+=step){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
      for (let y=0; y<=h; y+=step){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
      ctx.globalAlpha = 1;

      // Synchronicity: based on progress toward Phase 1 signal win threshold (12,000 by default)
      const winSignal = 12000;
      const sync = Math.max(0, Math.min(100, (p1.signal / winSignal) * 100));
      if ($syncPct) $syncPct.textContent = String(Math.floor(sync));

      // Phase offset transitions toward 90° at 100% (perfect circle)
      const corr = p1.corruption || 0;
      const chaos = (corr / 100) * 0.8;

      const sync01 = sync / 100;
      const targetPhi = Math.PI / 2; // 90°
      // Start chaotic: phi wanders; as sync increases, phi locks.
      const wander = (Math.sin(vis.t*0.7)*0.9 + Math.sin(vis.t*1.3)*0.4) * (1 - sync01);
      const phi = targetPhi + wander;

      // Slight distortion from corruption
      const distort = 1 + chaos * 0.25;

      const cx = w * 0.5, cy = h * 0.52;
      const R = Math.min(w,h) * 0.36;

      vis.t += dt * 0.6;

      ctx.strokeStyle = "rgba(156,255,176,0.88)";
      ctx.shadowColor = "rgba(156,255,176,0.35)";
      ctx.shadowBlur = 10;
      ctx.lineWidth = 1.4;

      ctx.beginPath();
      const pts = 900;
      for (let i=0; i<=pts; i++) {
        const t = (i/pts) * Math.PI * 2;
        const x = Math.sin(t * distort);
        const y = Math.sin((t * distort) + phi);

        // corruption adds jitter
        const jx = (Math.sin(t*17 + vis.t*5) * chaos) * 0.04;
        const jy = (Math.cos(t*19 + vis.t*6) * chaos) * 0.04;

        const px = cx + (x + jx) * R;
        const py = cy + (y + jy) * R;

        if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
      }
      ctx.closePath();
      ctx.stroke();

      // Reticle
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "rgba(156,255,176,0.55)";
      ctx.beginPath();
      ctx.arc(cx,cy,R,0,Math.PI*2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx-R,cy); ctx.lineTo(cx+R,cy);
      ctx.moveTo(cx,cy-R); ctx.lineTo(cx,cy+R);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Resize canvases on layout changes
    const onResize = () => { sizeCanvas($scopeCanvas); sizeCanvas($oscCanvas); };
    window.addEventListener("resize", onResize);
    // iOS layout quirk: ensure canvases are sized after first paint
    setTimeout(onResize, 0);
    setTimeout(onResize, 200);

const $scope = root.querySelector("#scope");
    const $osc = root.querySelector("#osc");
    const $hint = root.querySelector("#hint");

    let telemetryToggleEl = null;
    let telemetryBoxEl = null;


    const winOverlay = root.querySelector("#winOverlay");
    const winBody = root.querySelector("#winBody");
    const continueBtn = root.querySelector("#continue");
    const stayBtn = root.querySelector("#stay");

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
      p1.upgrades ??= { holdPing: 0, fatigueCooler: 0, spsBoost: 0, pingBoost: 0, spsMult: 0, noiseCanceller: 0, purgeEfficiency: 0, autopilotCore: 0 };
    p1.flags ??= {};
    p1.stats ??= { purges: 0, upgradesBought: 0 };

      $shop.innerHTML = "";

      for (const def of UPGRADE_DEFS) {
      const unlockedBySignal = (def.requiresSignal ? (p1.signal >= def.requiresSignal) : true);
        const lvl = p1.upgrades[def.id] || 0;
        const cost = costFor(def.base, def.growth, lvl);
        const canBuy = (p1.signal || 0) >= cost;
      const gated = !unlockedBySignal;

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
      p1.upgrades ??= { holdPing: 0, fatigueCooler: 0, spsBoost: 0, pingBoost: 0, spsMult: 0, noiseCanceller: 0, purgeEfficiency: 0, autopilotCore: 0 };
    p1.flags ??= {};
    p1.stats ??= { purges: 0, upgradesBought: 0 };

      const def = UPGRADE_DEFS.find((u) => u.id === upgradeId);
      if (!def) return;

      const lvl = p1.upgrades[upgradeId] || 0;
      const nextLvl = lvl + 1;
      const cost = costFor(def.base, def.growth, lvl);

      if ((p1.signal || 0) < cost) return;

      p1.signal -= cost;
      def.apply(p1, nextLvl);
      p1.stats ??= { purges: 0, upgradesBought: 0 };
      p1.stats.upgradesBought = (p1.stats.upgradesBought || 0) + 1;

      pushLog(p1.transmission, `UPGRADE//ACQUIRED  ${def.name} → Level ${nextLvl}`);
      api.setState(st);
      api.saveSoon();
      render();

    // Smooth scope rendering (cheap, battery-friendly)
    let lastFrame = performance.now();
    let rafId = 0;
    
    function updateRunClock(p1) {
      const el = root.querySelector("#ttRun");
      if (!el) return;
      p1.run ??= { state: "running", startedAt: (p1.bootedAt || Date.now()), completedAt: null };
      if (!p1.run.startedAt) p1.run.startedAt = p1.bootedAt || Date.now();
      const now = Date.now();
      const end = (p1.run.state === "completed" && p1.run.completedAt) ? p1.run.completedAt : now;
      const ms = Math.max(0, end - (p1.run.startedAt || p1.bootedAt || end));
      el.textContent = formatMs(ms);
    }

const frame = (t) => {
      const dt = Math.min(0.05, (t - lastFrame) / 1000);
      lastFrame = t;

      

      
      updateRunClock(api.getState().phases.phase1);
// Fatigue cooloff (passive). Scales with Thermal Bleed Valve upgrade.
      {
        const st = api.getState();
        const p1s = st.phases.phase1;
        p1s.hold ??= { fatigue: 0 };
        const lvl = (p1s.upgrades?.fatigueCooler || 0);
        const mult = 1 + (lvl * 0.20); // each level: +20% decay
        const decay = TUNE.holdFatigueDecayPerSec * mult;
        p1s.hold.fatigue = clamp((p1s.hold.fatigue || 0) - dt * decay, 0, 1);
        api.setState(st);
      }
// decay ping shake
      vis.shake = Math.max(0, (vis.shake || 0) - dt * 3.5);


      const st = api.getState();
      const p1 = st.phases.phase1;

      // Draw at ~30fps by skipping alternate frames on slow devices
      drawScope(p1, dt);
      drawOsc(p1, dt);

      updateTimeTrialPanel(p1);

      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
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
      p1.stats ??= { purges: 0, upgradesBought: 0 };
      p1.stats.purges = (p1.stats.purges || 0) + 1;

      pushLog(p1.transmission, `PURGE//EXEC  -${Math.floor(amt)}% corruption`);
      api.setState(st);
      api.saveSoon();
      render();
    }

    
    function doPing(fromHold = false) {
      const st = api.getState();
      const p1 = st.phases.phase1;
      if (p1.isDefeated) return;

      // gameplay
      p1.hold ??= { fatigue: 0 };
      const basePower = p1.pingPower || 5;

      // Hold-to-ping is convenient, but builds "fatigue" that reduces efficiency and adds heat/noise.
      let fatigue = clamp(p1.hold.fatigue || 0, 0, 1);
      let powerMult = 1;

      if (fromHold) {
        powerMult = Math.max(TUNE.holdMinPowerMult, 1 - 0.65 * fatigue);
        fatigue = clamp(fatigue + TUNE.holdFatigueInc, 0, 1);
      } else {
        // Reward active tapping: it "stabilizes" the line and bleeds off fatigue.
        fatigue = clamp(fatigue - TUNE.holdFatigueTapRelief, 0, 1);
      }

      p1.hold.fatigue = fatigue;

      p1.signal += basePower * powerMult;

      // Noise: tapping adds a small bump; holding adds extra heat when fatigued.
      const extraHeat = fromHold ? (TUNE.holdOverheatNoise * fatigue) : 0;
      p1.corruption = clamp((p1.corruption || 0) + TUNE.pingCorruptionNoise + extraHeat, 0, 100);
// visuals: spike the scope
      vis.lastPingAt = Date.now();
      vis.shake = Math.min(1, (vis.shake || 0) + (fromHold ? 0.15 : 0.35));

      api.setState(st);
      api.saveSoon();
      render();
    }

    // Ping: tap + press-and-hold auto-ping
    const $ping = root.querySelector("#ping");
    attachFastTap($ping, () => doPing(false));
    attachHoldPing(
      $ping,
      () => {
        const st = api.getState();
        const p1 = st.phases.phase1;
        const baseRate = 7; // pings/sec
        const lvl = (p1.upgrades?.pingBoost || 0);
        const rate = baseRate * (1 + lvl * 0.12);
        // As fatigue rises, holding slows a bit automatically (soft cap).
        const fatigue = clamp(p1.hold?.fatigue || 0, 0, 1);
        const slowMult = 1 + fatigue * 0.9;
        return (1000 / Math.max(1, rate)) * slowMult;
      },
      () => doPing(true),
      (on) => {
        const st = api.getState();
        st.phases.phase1._holdingPing = !!on;
        api.setState(st);
      }
    );


    root.querySelector("#purge").onclick = () => doPurge();

    // Dev tools
    if (isDev) {
      const devMsg = root.querySelector("#devMsg");
      const setDevMsg = (t) => { devMsg.textContent = t || ""; };

      telemetryToggleEl = root.querySelector("#telemetryToggle");
      telemetryBoxEl = root.querySelector("#telemetryBox");

      // Restore last state (kept in save for convenience)
      const st = api.getState();
      const p1 = st.phases.phase1;
      if (p1._telemetryOpen) telemetryBoxEl.style.display = "block";

      telemetryToggleEl.onclick = () => {
        const st2 = api.getState();
        const p12 = st2.phases.phase1;
        p12._telemetryOpen = !p12._telemetryOpen;
        telemetryBoxEl.style.display = p12._telemetryOpen ? "block" : "none";
        api.setState(st2);
        render();
      };


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

      root.querySelector("#goP2").onclick = async () => {
        const st = api.getState();
        st.meta.unlockedPhases ??= { phase1: true, phase2: false };
        st.meta.unlockedPhases.phase2 = true;
        api.setState(st);
        api.saveSoon();
        const st2 = api.getState();
      st2.phases.phase1.win ??= { achieved: true, handled: false, achievedAt: null };
      st2.phases.phase1.win.handled = true;
      api.setState(st2);
      api.saveSoon();
      await api.setPhase("phase2");
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

    attachFastTap(restartBtn, () => {
      const st = api.getState();
      const p1 = st.phases.phase1;

      // Preserve best time-trial record if present
      const keepBest = p1.timeTrial?.bestMs ?? null;

      // Hard reset Phase 1 run state
      p1.isDefeated = false;
      p1.corruption = 0;
      p1.signal = 0;
      p1.signalPerSecond = 1;
      p1.pingPower = 5;

      p1.winHoldMs = 0;
      p1.completed = false;

      // Reset upgrades (fresh run)
      p1.upgrades = { spsBoost: 0, pingBoost: 0, spsMult: 0, noiseCanceller: 0, purgeEfficiency: 0 };

      // Reset warning cooldowns/flags so UI doesn't spam on resume
      p1.warnFlags = { c25: false, c50: false, c75: false };
      p1.warnCooldownUntil = 0;

      // Reset time trial run bookkeeping (keep best)
      p1.timeTrial ??= { bestMs: keepBest, lastMs: null, runId: 0, submittedRunId: null };
      p1.timeTrial.bestMs = keepBest;
      p1.timeTrial.lastMs = null;
      p1.timeTrial.runId = (p1.timeTrial.runId || 0) + 1;
      p1.timeTrial.submittedRunId = null;

      // Run lifecycle
      p1.run = { state: "running", startedAt: Date.now(), completedAt: null };

      // Win flags
      p1.win = { achieved: false, handled: false, achievedAt: null };

      p1.comms = [];
      p1.transmission = [];
      pushLog(p1.comms, "CONTROL//RETURN  Signal lock re-established. Phase restarted.");
      pushLog(p1.comms, "CONTROL//NOTE  Corruption present. Maintain integrity.");

      api.setState(st);
      api.saveSoon();

      defeatOverlay.style.display = "none";
      render();
    });

    continueBtn.onclick = async () => {
      const st = api.getState();
      if (!st?.meta?.unlockedPhases?.phase2) return;
      winOverlay.style.display = "none";
      const st2 = api.getState();
      st2.phases.phase1.win ??= { achieved: true, handled: false, achievedAt: null };
      st2.phases.phase1.win.handled = true;
      api.setState(st2);
      api.saveSoon();
      await api.setPhase("phase2");
    };
    stayBtn.onclick = () => { winOverlay.style.display = "none"; };

    
    function resetPhase1ForTimeTrial() {
      const st = api.getState();
      const old = st.phases.phase1;

      old.timeTrial ??= { bestMs: null, lastMs: null, runId: 0 };
      const keepBest = old.timeTrial.bestMs;

      const now = Date.now();
      st.phases.phase1 = {
        bootedAt: now,
        signal: 0,
        signalPerSecond: 0.5,
        pingPower: 5,
        corruption: 0,
        corruptionRateBase: 0.18,
        upgrades: { spsBoost: 0, pingBoost: 0, spsMult: 0, noiseCanceller: 0, purgeEfficiency: 0, autopilotCore: 0 },
        autopilot: { unlocked: (old.autopilot?.unlocked || false), enabled: false, targetCorruption: 40, budgetFraction: 0.35, offlineCap: 95 },
        timeTrial: { bestMs: keepBest ?? null, lastMs: null, runId: (old.timeTrial.runId || 0) + 1 },

        run: { state: "running", startedAt: now, completedAt: null },

        win: { achieved: false, handled: false, achievedAt: null },
        comms: [],
        transmission: [],
      };

      pushLog(st.phases.phase1.comms, "CONTROL//RESET  Phase 1 restarted (time trial).");
      pushLog(st.phases.phase1.transmission, "OPS//NOTE  Clock restarted. Run clean.");

      api.setState(st);
      api.saveSoon();
      render();
    }

function maybeWarn(p1) {
      const now = Date.now();
      const c = p1.corruption || 0;

      // Persist warnings across sessions (avoid underscore keys which may be stripped by serializers).
      p1.warnFlags ??= { c25: false, c50: false, c75: false };
      // Migrate legacy flags if present
      if (p1._warn25) { p1.warnFlags.c25 = true; delete p1._warn25; }
      if (p1._warn50) { p1.warnFlags.c50 = true; delete p1._warn50; }
      if (p1._warn75) { p1.warnFlags.c75 = true; delete p1._warn75; }

      p1.warnCooldownUntil ??= 0;

      // Cooldown so popups don't spam when corruption stays high (especially after login/offline progress).
      const canWarn = now >= p1.warnCooldownUntil;

      if (c >= 25 && !p1.warnFlags.c25) {
        p1.warnFlags.c25 = true;
        pushLog(p1.comms, "CONTROL//WARN  Corruption rising. Consider Noise Canceller.");
      }

      if (c >= 50 && !p1.warnFlags.c50 && canWarn) {
        p1.warnFlags.c50 = true;
        p1.warnCooldownUntil = now + 20000; // 20s cooldown
        pushLog(p1.comms, "CONTROL//WARN  Integrity degraded. Purge recommended.");
      }

      if (c >= 75 && !p1.warnFlags.c75 && canWarn) {
        p1.warnFlags.c75 = true;
        p1.warnCooldownUntil = now + 15000; // 15s cooldown
        pushLog(p1.comms, "CONTROL//ALERT  Critical corruption. Immediate action required.");
      }
    }

    function winProgressText(p1) {
      const stable = isWinStable(p1);
      const remaining = Math.max(0, TUNE.winHoldMs - (p1.winHoldMs || 0));
      if (p1.completed) return "Phase stabilised.";
      if (!stable) {
        const missing = [];
        if ((p1.signal || 0) < TUNE.winSignal) missing.push(`Signal ≥ ${nfmt(TUNE.winSignal)}`);
        if ((p1.corruption || 0) > TUNE.winCorruptionMax) missing.push(`Corruption ≤ ${TUNE.winCorruptionMax}%`);
        if (!isDefensiveReady(p1)) missing.push("Install a defensive system (Noise Canceller or Purge Manifold)");
        return `Stabilisation criteria: ${missing.join(" • ")}`;
      }
      return `Stabilising… hold for ${Math.ceil(remaining / 1000)}s`;
    }

    
    function telemetryText(p1, rate, purgeC, purgeA) {
      const c = clamp(p1.corruption || 0, 0, 100);
      const etaFailSec = rate > 0 ? (100 - c) / rate : 999999;
      const stable = isWinStable(p1);
      const remainingMs = Math.max(0, TUNE.winHoldMs - (p1.winHoldMs || 0));
      const pingNoise = TUNE.pingCorruptionNoise;

      const lines = [];
      lines.push("TELEMETRY//PHASE1");
      lines.push(`Signal: ${nfmt(p1.signal)} | SPS: ${(p1.signalPerSecond || 0).toFixed(2)} | Ping: ${nfmt(p1.pingPower || 0)}`);
      lines.push(`Corruption: ${Math.floor(c)}% | Rate: ${rate.toFixed(2)}/s | ETA fail: ${Math.floor(etaFailSec/60)}m ${Math.floor(etaFailSec%60)}s`);
      lines.push(`Win: Signal≥${nfmt(TUNE.winSignal)} AND Corr≤${TUNE.winCorruptionMax}% AND defensive upgrade AND hold ${Math.ceil(TUNE.winHoldMs/1000)}s`);
      lines.push(`Eligible: ${stable ? "YES" : "NO"} | Hold remaining: ${Math.ceil(remainingMs/1000)}s`);
      lines.push(`Purge: cost ${nfmt(purgeC)} | amount -${Math.floor(purgeA)}% | Ping noise +${pingNoise.toFixed(2)}%`);
      lines.push(`Upgrades: spsBoost ${p1.upgrades?.spsBoost||0} | pingBoost ${p1.upgrades?.pingBoost||0} | spsMult ${p1.upgrades?.spsMult||0} | noiseCanceller ${p1.upgrades?.noiseCanceller||0} | purgeEff ${p1.upgrades?.purgeEfficiency||0}`);
      lines.push(`Milestones: ${Object.keys(p1.flags || {}).join(', ') || '(none)'}`);
      return lines.join("\n");
    }


    function updateTimeTrialPanel(p1) {
      if (!$ttClock) return;
      const now = Date.now();
      const runMs = Math.max(0, now - (p1.bootedAt || now));
      $ttClock.textContent = fmtMs(runMs);
      $ttBest.textContent = (p1.timeTrial?.bestMs == null) ? "--:--.--" : fmtMs(p1.timeTrial.bestMs);
      $ttLast.textContent = (p1.timeTrial?.lastMs == null) ? "--:--.--" : fmtMs(p1.timeTrial.lastMs);
    }

    function renderLeaderboardRows(rows) {
      if (!$lbList) return;
      if (!rows || rows.length === 0) {
        $lbList.textContent = "NO DATA YET.";
        return;
      }
      let out = "RANK  USERNAME            TIME\n";
      out += "----  ------------------  ---------\n";
      rows.forEach((r, i) => {
        const rank = String(i + 1).padStart(2, " ");
        const name = String(r.username || "UNKNOWN").toUpperCase().slice(0, 18).padEnd(18, " ");
        const time = fmtMs(r.time_ms);
        out += `${rank}    ${name}  ${time}\n`;
      });
      $lbList.textContent = out;
    }

    async function fetchLeaderboard(which) {
      const profile = api.getProfile();
      if (!profile) {
        $lbStatus.textContent = "Not logged in.";
        renderLeaderboardRows([]);
        return;
      }

      $lbStatus.textContent = "Fetching…";
      try {
        let q = api.supabase
          .from("phase_time_trials")
          .select("username, time_ms")
          .eq("phase", 1)
          .order("time_ms", { ascending: true })
          .limit(10);

        if (which === "me") q = q.eq("player_id", profile.id);

        const { data, error } = await q;
        if (error) throw error;

        $lbStatus.textContent = (which === "me") ? "My top 10 runs (Phase 1)" : "Global top 10 (Phase 1)";
        renderLeaderboardRows(data || []);
      } catch (e) {
        $lbStatus.textContent = e?.message || String(e);
        renderLeaderboardRows([]);
      }
    }

    async function submitTimeTrialRunOnce(runMs) {
      const profile = api.getProfile();
      if (!profile) return;

      const st = api.getState();
      const p1 = st.phases.phase1;
      p1.timeTrial ??= { bestMs: null, lastMs: null, runId: 0, submittedRunId: null };

      if (p1.timeTrial.submittedRunId === p1.timeTrial.runId) return;

      try {
        const { error } = await api.supabase
          .from("phase_time_trials")
          .insert({
            phase: 1,
            player_id: profile.id,
            username: profile.username,
            time_ms: Math.floor(runMs),
          });

        if (!error) {
          p1.timeTrial.submittedRunId = p1.timeTrial.runId;
          api.setState(st);
          api.saveSoon();
        }
      } catch (e) {
        // silent: leaderboard is non-critical
        console.warn(e);
      }
    }



    
    function renderFatigue(p1) {
      const hud = root.querySelector("#fatigueHud");
      if (!hud) return;
      p1.hold ??= { fatigue: 0 };
      const f = clamp(p1.hold.fatigue || 0, 0, 1);

      const show = f > 0.03 || (vis && vis.holdPing);
      hud.style.display = show ? "block" : "none";

      const pct = Math.round(f * 100);
      const pctEl = root.querySelector("#fatiguePct");
      const bar = root.querySelector("#fatigueBar");
      if (pctEl) pctEl.textContent = `${pct}%`;
      if (bar) bar.style.width = `${pct}%`;

      hud.style.opacity = String(show ? (0.35 + 0.65 * f) : 0);
    }
function renderTimeTrial(p1) {
      const runEl = root.querySelector("#ttRun");
      const lastEl = root.querySelector("#ttLast");
      const bestEl = root.querySelector("#ttBest");
      if (!runEl) return;
      p1.run ??= { state: "running", startedAt: (p1.bootedAt || Date.now()), completedAt: null };
      p1.timeTrial ??= { bestMs: null, lastMs: null, runId: 0, submittedRunId: null };

      const now = Date.now();
      let runMs = 0;
      if (p1.run.state === "completed" && p1.run.completedAt) {
        runMs = Math.max(0, p1.run.completedAt - (p1.run.startedAt || p1.bootedAt || p1.run.completedAt));
      } else {
        runMs = Math.max(0, now - (p1.run.startedAt || p1.bootedAt || now));
      }

      runEl.textContent = formatMs(runMs);
      if (lastEl) lastEl.textContent = formatMs(p1.timeTrial.lastMs);
      if (bestEl) bestEl.textContent = formatMs(p1.timeTrial.bestMs);
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

      $hint.textContent = `Corruption rate: ${rate.toFixed(2)}/s • Purge: -${Math.floor(purgeA)}% for ${nfmt(purgeC)} signal • ${winProgressText(p1)}`;

      renderShop();

      
      // Ensure scopes render even if RAF is throttled on mobile
      drawScope(p1, 0.016);
      drawOsc(p1, 0.016);
$comms.textContent = (p1.comms || []).join("\n");
      $tx.textContent = (p1.transmission || []).join("\n");

      // Telemetry (dev-only)
      if (isDev && telemetryBoxEl && p1._telemetryOpen) {
        telemetryBoxEl.textContent = telemetryText(p1, rate, purgeC, purgeA);
      }


      // Scope toys (purely visual)
      const ph = (Date.now() / 500) % (Math.PI * 2);
      const amp = clamp((p1.signalPerSecond || 1) / 20, 0.15, 1.0);
      if ($scope && $osc) {
      $scope.textContent = renderWave(64, 8, ph, amp);
      $osc.textContent = renderWave(24, 8, ph * 1.4, amp * 0.9);
      }
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
      } else {
        defeatOverlay.style.display = "none";
      }

      if (p1.completed && st.meta?.unlockedPhases?.phase2) {
        winBody.innerHTML = `
          <div style="opacity:0.92;">
            Signal held at <b>${nfmt(TUNE.winSignal)}</b> while corruption stayed under <b>${TUNE.winCorruptionMax}%</b>.<br/>
            TIME: <b>${fmtMs(p1.timeTrial?.lastMs ?? 0)}</b>  BEST: <b>${p1.timeTrial?.bestMs == null ? "--:--.--" : fmtMs(p1.timeTrial.bestMs)}</b>.
          </div>
          <div style="margin-top:8px; opacity:0.85; font-size:13px;">
            CONTROL//RETURN  “You did it. The ship’s quiet. For now.”
          </div>
        `;
        // Mark win once and store time trial stats
        p1.timeTrial ??= { bestMs: null, lastMs: null, runId: 0, submittedRunId: null };
        p1.win ??= { achieved: false, handled: false, achievedAt: null };
        p1.run ??= { state: "running", startedAt: (p1.bootedAt || Date.now()), completedAt: null };

        if (p1.run.state === "running" && !p1.win.achieved) {
          p1.win.achieved = true;
          p1.win.achievedAt = Date.now();
          p1.run.completedAt = p1.win.achievedAt;
          p1.run.state = "completed";

          const started = p1.run.startedAt || p1.bootedAt || p1.run.completedAt;
          const runMs = Math.max(0, p1.run.completedAt - started);

          p1.timeTrial.lastMs = runMs;
          if (p1.timeTrial.bestMs == null || runMs < p1.timeTrial.bestMs) p1.timeTrial.bestMs = runMs;
        }

        if (p1.run?.state === "running" && !p1.win?.handled) { winOverlay.style.display = "block"; }
      }
    }

    render();

    const repaint = setInterval(() => {
      const st = api.getState();
      maybeWarn(st.phases.phase1);
      const beforeFlags = JSON.stringify(st.phases.phase1.flags || {});
      processMilestones(st.phases.phase1);
      const afterFlags = JSON.stringify(st.phases.phase1.flags || {});
      if (beforeFlags !== afterFlags) {
        api.setState(st);
        api.saveSoon();
      }
      render();
    }, 500);

    this._cleanup = () => {
      _popupHook = null; clearInterval(repaint); cancelAnimationFrame(rafId); window.removeEventListener('resize', onResize); };
  },

  unmount() {
    if (this._cleanup) this._cleanup();
  },

  tick({ state, dtMs }) {
    if (state.isDefeated) return { state };

    // Hold-to-ping fatigue decay (prevents "hold forever" dominance)
    state.hold ??= { fatigue: 0 };
    const holding = !!state._holdingPing;
    const decay = TUNE.holdFatigueDecayPerSec * (dtMs / 1000);
    if (!holding) state.hold.fatigue = clamp((state.hold.fatigue || 0) - decay, 0, 1);


    // Signal gain
    const sps = state.signalPerSecond || 0;
    state.signal = (state.signal || 0) + sps * (dtMs / 1000);

    // Corruption pressure
    const rate = computeCorruptionRate(state);
    state.corruption = clamp((state.corruption || 0) + rate * (dtMs / 1000), 0, 100);

    if (state.corruption >= 100) {
      state.isDefeated = true;
      state.winHoldMs = 0;
      processMilestones(state);
    return { state };
    }

    // Win stability timer
    if (!state.completed) {
      if (isWinStable(state)) {
        state.winHoldMs = (state.winHoldMs || 0) + dtMs;
        if (state.winHoldMs >= TUNE.winHoldMs) {
          state.completed = true;
          state.winHoldMs = TUNE.winHoldMs;

          // Unlock Phase 2
          // (Phase-local choice, stored in core meta)
          // eslint-disable-next-line no-underscore-dangle
          state._justWon = true;
        }
      } else {
        state.winHoldMs = 0;
      }
    }

    return { state };
  },

  applyOfflineProgress({ state, dtMs }) {
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

    if (state.corruption >= 100) {
      state.isDefeated = true;
      state.winHoldMs = 0;
    }

    // Don't award "hold time" offline (prevents accidental wins during tab sleep)
    state.winHoldMs = 0;

    const summary = [
      `Offline for ${fmtMs(dtMs)}`,
      `Generated +${Math.floor(gain)} signal`,
      `Corruption: ${Math.floor(beforeCorr)}% → ${Math.floor(state.corruption)}%`,
    ];

    if (state.isDefeated) summary.push(`SYSTEM FAILURE occurred while offline.`);
    else summary.push(`Stabilisation timer resets while offline.`);

    return { state, summary };
  },

  // Hook called by core? If not present, we do unlock in mount via backfill logic.
  onAfterTick({ globalState }) {
    // Some cores call plugin hooks; if yours doesn't, this is harmless.
    // We use it to transfer a one-tick win flag into global meta + logs.
    const p1 = globalState?.phases?.phase1;
    if (p1?._justWon) {
      p1._justWon = false;

      globalState.meta.unlockedPhases ??= { phase1: true, phase2: false };
      globalState.meta.unlockedPhases.phase2 = true;

      pushLog(p1.comms, "CONTROL//RETURN  Stabilisation achieved. Phase 2 unlocked.");
      pushLog(p1.transmission, "LOCK//UNSEALED  PHASE_02");
    }
    return { globalState };
  },
};
