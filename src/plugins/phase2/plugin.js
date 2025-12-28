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

function costFor(base, growth, lvl) {
  return Math.floor(base * Math.pow(growth, lvl));
}

// Phase 2 tuning lives here (phase-local)
const TUNE = {
  // Heat behavior
  heatMax: 100,
  overheatLockSeconds: 6,

  // Actions
  ventBaseCost: 25,          // power
  ventBaseAmount: 18,        // heat points
  ventCooldownMs: 2500,

  // Signal as a “benefit” resource in this phase too
  pingPower: 3,
  pingHeat: 0.35,
};

const UPGRADES = [
  {
    id: "generator",
    name: "Aux Generator",
    desc: "Increase Power/sec.",
    base: 30,
    growth: 1.55,
    effect: (lvl) => `+${(lvl + 1) * 0.6} Power/sec`,
    apply: (p2, nextLvl) => {
      p2.powerPerSecond += 0.6;
      p2.upgrades.generator = nextLvl;
    },
  },
  {
    id: "insulation",
    name: "Thermal Insulation",
    desc: "Reduce heat rate.",
    base: 45,
    growth: 1.60,
    effect: (lvl) => `-${Math.floor((lvl + 1) * 10)}% heat rate`,
    apply: (p2, nextLvl) => {
      p2.upgrades.insulation = nextLvl;
    },
  },
  {
    id: "rerouteEfficiency",
    name: "Reroute Dampers",
    desc: "Reroute costs less power and adds less heat.",
    base: 80,
    growth: 1.70,
    effect: (lvl) => `-${Math.floor((lvl + 1) * 8)}% drain & heat`,
    apply: (p2, nextLvl) => {
      p2.upgrades.rerouteEfficiency = nextLvl;
    },
  },
  {
    id: "venting",
    name: "Pressure Vents",
    desc: "Vent cools more heat per use.",
    base: 70,
    growth: 1.70,
    effect: (lvl) => `+${Math.floor((lvl + 1) * 12)}% vent power`,
    apply: (p2, nextLvl) => {
      p2.upgrades.venting = nextLvl;
    },
  },
];

function heatRate(p2) {
  const ins = p2.upgrades?.insulation || 0;
  const reduction = clamp(ins * 0.10, 0, 0.7); // up to 70%
  return (p2.heatRateBase || 0.10) * (1 - reduction);
}

function rerouteParams(p2) {
  const eff = p2.upgrades?.rerouteEfficiency || 0;
  const reduction = clamp(eff * 0.08, 0, 0.6);

  const base = p2.reroute || {};
  return {
    drain: (base.powerDrainPerSec || 2.2) * (1 - reduction),
    mult: (base.spsMultiplier || 2.0),
    heatAdd: (base.heatAddPerSec || 0.75) * (1 - reduction),
  };
}

function ventCost(p2) {
  return Math.floor(TUNE.ventBaseCost);
}

function ventAmount(p2) {
  const lvl = p2.upgrades?.venting || 0;
  const mult = 1 + lvl * 0.12;
  return TUNE.ventBaseAmount * mult;
}

export default {
  id: "phase2",

  mount(root, api) {
    const profile = api.getProfile();
    const isDev = profile?.username === "PrymalChaos" || profile?.role === "admin";

    // Backfill for older saves
    const stInit = api.getState();
    const p2 = (stInit.phases.phase2 ??= {});
    p2.signal ??= 0;
    p2.signalPerSecond ??= 0.5;
    p2.power ??= 0;
    p2.powerPerSecond ??= 1.0;
    p2.heat ??= 0;
    p2.heatRateBase ??= 0.10;
    p2.isOverheated ??= false;
    p2._overheatUntil ??= 0;
    p2._ventCooldownUntil ??= 0;

    p2.reroute ??= { active: false, powerDrainPerSec: 2.2, spsMultiplier: 2.0, heatAddPerSec: 0.75 };
    p2.upgrades ??= { generator: 0, insulation: 0, rerouteEfficiency: 0, venting: 0 };

    p2.comms ??= [];
    p2.transmission ??= [];

    api.setState(stInit);

    if (p2.comms.length === 0) {
      pushLog(p2.comms, "ENGINEERING//BOOT  Power bus connected. Heat regulation online.");
      pushLog(p2.comms, "ENGINEERING//NOTE  Reroute increases output but risks overheat.");
      api.saveSoon();
    }

    root.innerHTML = `
      <style>
        .p2-grid { display:grid; gap:12px; }
        .p2-panel {
          border: 1px solid rgba(215,255,224,0.16);
          border-radius: 12px;
          background: rgba(10,14,18,0.72);
          padding: 12px;
          position: relative;
          overflow:hidden;
        }
        .p2-scan:before{
          content:"";
          position:absolute; inset:0;
          background: repeating-linear-gradient(to bottom,
            rgba(215,255,224,0.06) 0px,
            rgba(215,255,224,0.03) 1px,
            rgba(0,0,0,0) 3px);
          opacity:0.32;
          pointer-events:none;
          mix-blend-mode:screen;
        }
        .p2-title { font-weight:900; letter-spacing:0.08em; font-size:12px; opacity:0.9; }
        .p2-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .p2-btn{
          padding:10px;
          border-radius:10px;
          border:1px solid rgba(215,255,224,0.18);
          background: rgba(5,7,10,0.35);
          color: inherit;
        }
        .p2-btn:disabled{ opacity:0.45; }
        .p2-row{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; }
        .bar{ height:10px; border-radius:99px; border:1px solid rgba(215,255,224,0.14); background: rgba(5,7,10,0.35); overflow:hidden; }
        .fill{ height:100%; width:0%; background: rgba(215,255,224,0.55); }
        .p2-logs{ display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
        @media (max-width: 740px){ .p2-logs{ grid-template-columns:1fr; } }
        .logbox{
          height:160px; overflow:auto;
          border-radius:10px;
          border:1px solid rgba(215,255,224,0.12);
          background: rgba(5,7,10,0.30);
          padding:10px;
          line-height:1.35;
          font-size:12px;
          opacity:0.92;
          white-space:pre-wrap;
        }
      </style>

      <div style="max-width:980px; margin:0 auto; padding:14px;">
        <div class="p2-panel p2-scan">
          <div class="p2-row">
            <div>
              <div style="opacity:0.85; font-size:12px;">Logged in as</div>
              <div style="font-weight:900; letter-spacing:0.05em;">
                ${escapeHtml(profile?.username ?? "UNKNOWN")}
              </div>
            </div>
            <div style="display:flex; gap:10px;">
              <button id="toP1" class="p2-btn">Back to Phase 1</button>
              <button id="restartP1" class="p2-btn">Restart Phase 1 (Time Trial)</button>
              <button id="logout" class="p2-btn">Logout</button>
            </div>
          </div>
        </div>

        <div class="p2-grid" style="margin-top:12px;">
          <div class="p2-panel p2-scan">
            <div class="p2-title">ENGINEERING STATUS</div>

            <div class="p2-row" style="margin-top:10px;">
              <div style="min-width:160px;">
                <div style="opacity:0.82; font-size:12px;">Signal</div>
                <div id="signal" style="font-weight:900; font-size:22px;">0</div>
                <div style="opacity:0.75; font-size:12px;">SPS <span id="sps">0</span></div>
              </div>

              <div style="min-width:220px;">
                <div style="opacity:0.82; font-size:12px;">Power</div>
                <div style="display:flex; align-items:center; gap:10px;">
                  <div class="bar" style="flex:1;"><div id="powFill" class="fill"></div></div>
                  <div id="powText" style="width:70px; text-align:right; font-weight:900;">0</div>
                </div>
                <div style="opacity:0.75; font-size:12px;">PPS <span id="pps">0</span></div>
              </div>

              <div style="min-width:220px;">
                <div style="opacity:0.82; font-size:12px;">Heat</div>
                <div style="display:flex; align-items:center; gap:10px;">
                  <div class="bar" style="flex:1;"><div id="heatFill" class="fill"></div></div>
                  <div id="heatText" style="width:54px; text-align:right; font-weight:900;">0%</div>
                </div>
                <div id="heatHint" style="opacity:0.75; font-size:12px;"></div>
              </div>
            </div>

            <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
              <button id="ping" class="p2-btn" style="flex:1; min-width:160px;">Ping</button>
              <button id="reroute" class="p2-btn" style="flex:1; min-width:160px;">Reroute: OFF</button>
              <button id="vent" class="p2-btn" style="flex:1; min-width:160px;">Vent</button>
            </div>

            <div id="hint" style="margin-top:10px; font-size:12px; opacity:0.85;"></div>
          </div>

          <div class="p2-panel p2-scan">
            <div class="p2-title">UPGRADES</div>
            <div style="opacity:0.8; font-size:12px; margin-top:6px;">
              Improve generation and survivability. Reroute is powerful but dangerous.
            </div>
            <div id="shop" style="margin-top:10px; display:grid; gap:10px;"></div>
          </div>

          <div class="p2-panel p2-scan">
            <div class="p2-title">COMMS + TRANSMISSION</div>
            <div class="p2-logs" style="margin-top:10px;">
              <div>
                <div style="font-weight:900; font-size:12px; opacity:0.85;">COMMS</div>
                <div id="commsBox" class="logbox p2-mono"></div>
              </div>
              <div>
                <div style="font-weight:900; font-size:12px; opacity:0.85;">TRANSMISSION</div>
                <div id="txBox" class="logbox p2-mono"></div>
              </div>
            </div>
          </div>

          <div class="p2-panel p2-scan" style="display:${isDev ? "block" : "none"};">
            <div class="p2-title">DEV</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
              <button id="givePow" class="p2-btn">+200 Power</button>
              <button id="giveSig" class="p2-btn">+5,000 Signal</button>
              <button id="resetP2" class="p2-btn">Reset Phase 2</button>
            </div>
            <div id="devMsg" style="margin-top:10px; font-size:12px; opacity:0.9;"></div>
          </div>

          <div id="overheatOverlay" style="display:none; position:fixed; inset:0; background: rgba(5,7,10,0.94); padding:14px;">
            <div class="p2-panel p2-scan" style="max-width:720px; margin: 0 auto;">
              <div class="p2-title">OVERHEAT</div>
              <div id="overheatBody" style="margin-top:10px; font-size:14px; opacity:0.92;"></div>
              <button id="coolDown" class="p2-btn" style="margin-top:12px; width:100%;">COOL DOWN</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const $signal = root.querySelector("#signal");
    const $sps = root.querySelector("#sps");
    const $powFill = root.querySelector("#powFill");
    const $powText = root.querySelector("#powText");
    const $pps = root.querySelector("#pps");
    const $heatFill = root.querySelector("#heatFill");
    const $heatText = root.querySelector("#heatText");
    const $heatHint = root.querySelector("#heatHint");
    const $hint = root.querySelector("#hint");
    const $shop = root.querySelector("#shop");
    const $comms = root.querySelector("#commsBox");
    const $tx = root.querySelector("#txBox");

    const overheatOverlay = root.querySelector("#overheatOverlay");
    const overheatBody = root.querySelector("#overheatBody");

    const btnReroute = root.querySelector("#reroute");
    const btnVent = root.querySelector("#vent");

    attachFastTap(root.querySelector("#logout"), async () => {
      await api.supabase.auth.signOut();
    });

    attachFastTap(root.querySelector("#toP1"), async () => {
      await api.setPhase("phase1");
    });

    attachFastTap(root.querySelector("#restartP1"), async () => {
      const st = api.getState();
      const old = st.phases.phase1 || {};
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
        win: { achieved: false, handled: false, achievedAt: null },
        comms: [],
        transmission: [],
      };
      api.setState(st);
      api.saveSoon();
      await api.setPhase("phase1");
    });

    function buy(upgradeId) {
      const st = api.getState();
      const p2 = st.phases.phase2;
      const def = UPGRADES.find((u) => u.id === upgradeId);
      if (!def) return;

      const lvl = p2.upgrades[upgradeId] || 0;
      const cost = costFor(def.base, def.growth, lvl);

      if ((p2.signal || 0) < cost) return;

      p2.signal -= cost;
      def.apply(p2, lvl + 1);

      pushLog(p2.transmission, `UPGRADE//ACQUIRED  ${def.name} → Level ${lvl + 1}`);
      api.setState(st);
      api.saveSoon();
      render();
    }

    function renderShop() {
      const st = api.getState();
      const p2 = st.phases.phase2;
      $shop.innerHTML = "";

      for (const def of UPGRADES) {
        const lvl = p2.upgrades[def.id] || 0;
        const cost = costFor(def.base, def.growth, lvl);
        const canBuy = (p2.signal || 0) >= cost;

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
                Level <b>${lvl}</b> → ${escapeHtml(def.effect(lvl))}
              </div>
            </div>

            <div style="text-align:right;">
              <div style="opacity:0.75; font-size:12px;">Cost</div>
              <div style="font-weight:900; font-size:18px;">${nfmt(cost)}</div>
              <button data-buy="${def.id}" ${canBuy ? "" : "disabled"} class="p2-btn"
                style="margin-top:6px; ${canBuy ? "" : "opacity:0.55;"}">
                Buy
              </button>
            </div>
          </div>
        `;
        attachFastTap(row.querySelector(`[data-buy="${def.id}"]`), () => buy(def.id));
        $shop.appendChild(row);
      }
    }

    function doPing() {
      const st = api.getState();
      const p2 = st.phases.phase2;
      if (p2.isOverheated) return;

      p2.signal += TUNE.pingPower;
      p2.heat = clamp((p2.heat || 0) + TUNE.pingHeat, 0, TUNE.heatMax);

      api.setState(st);
      api.saveSoon();
      render();
    }

    function toggleReroute() {
      const st = api.getState();
      const p2 = st.phases.phase2;
      if (p2.isOverheated) return;

      p2.reroute.active = !p2.reroute.active;

      pushLog(
        p2.transmission,
        p2.reroute.active
          ? "REROUTE//ENGAGED  Output increasing."
          : "REROUTE//DISENGAGED  Returning to safe flow."
      );

      api.setState(st);
      api.saveSoon();
      render();
    }

    function doVent() {
      const st = api.getState();
      const p2 = st.phases.phase2;

      const now = Date.now();
      if ((p2._ventCooldownUntil || 0) > now) return;

      const cost = ventCost(p2);
      if ((p2.power || 0) < cost) return;

      const amt = ventAmount(p2);
      p2.power -= cost;
      p2.heat = clamp((p2.heat || 0) - amt, 0, TUNE.heatMax);

      p2._ventCooldownUntil = now + TUNE.ventCooldownMs;

      pushLog(p2.transmission, `VENT//OPEN  -${Math.floor(amt)} heat`);
      api.setState(st);
      api.saveSoon();
      render();
    }

    attachFastTap(root.querySelector("#ping"), doPing);
    attachFastTap(btnReroute, toggleReroute);
    attachFastTap(btnVent, doVent);

    // Overheat overlay cooldown
    const coolDown = root.querySelector("#coolDown");
    attachFastTap(coolDown, () => {
      const st = api.getState();
      const p2 = st.phases.phase2;

      p2.isOverheated = false;
      p2.heat = Math.max(0, (p2.heat || 0) - 30);
      p2._overheatUntil = 0;
      pushLog(p2.comms, "ENGINEERING//CLEAR  Lockout lifted. Keep it cool.");

      api.setState(st);
      api.saveSoon();
      overheatOverlay.style.display = "none";
      render();
    });

    // Dev tools
    if (isDev) {
      const devMsg = root.querySelector("#devMsg");
      const setDevMsg = (t) => (devMsg.textContent = t || "");

      attachFastTap(root.querySelector("#givePow"), () => {
        const st = api.getState();
        st.phases.phase2.power += 200;
        api.setState(st);
        api.saveSoon();
        setDevMsg("+200 Power");
        render();
      });

      attachFastTap(root.querySelector("#giveSig"), () => {
        const st = api.getState();
        st.phases.phase2.signal += 5000;
        api.setState(st);
        api.saveSoon();
        setDevMsg("+5,000 Signal");
        render();
      });

      attachFastTap(root.querySelector("#resetP2"), () => {
        const st = api.getState();
        st.phases.phase2.signal = 0;
        st.phases.phase2.signalPerSecond = 0.5;
        st.phases.phase2.power = 0;
        st.phases.phase2.powerPerSecond = 1.0;
        st.phases.phase2.heat = 0;
        st.phases.phase2.isOverheated = false;
        st.phases.phase2._overheatUntil = 0;
        st.phases.phase2._ventCooldownUntil = 0;
        st.phases.phase2.reroute = { active: false, powerDrainPerSec: 2.2, spsMultiplier: 2.0, heatAddPerSec: 0.75 };
        st.phases.phase2.upgrades = { generator: 0, insulation: 0, rerouteEfficiency: 0, venting: 0 };
        st.phases.phase2.comms = [];
        st.phases.phase2.transmission = [];
        pushLog(st.phases.phase2.comms, "ENGINEERING//BOOT  Reset complete.");
        api.setState(st);
        api.saveSoon();
        setDevMsg("Phase 2 reset.");
        render();
      });
    }

    function maybeWarn(p2) {
      const h = p2.heat || 0;
      if (h >= 40 && !p2._warn40) {
        p2._warn40 = true;
        pushLog(p2.comms, "ENGINEERING//WARN  Heat rising. Venting advised.");
      }
      if (h >= 70 && !p2._warn70) {
        p2._warn70 = true;
        pushLog(p2.comms, "ENGINEERING//ALERT  Heat critical. Reroute may cause lockout.");
      }
    }

    function render() {
      const st = api.getState();
      const p2 = st.phases.phase2;

      const rr = rerouteParams(p2);

      // Power bar: show 0..200 scale visually (soft cap)
      const pow = p2.power || 0;
      const powPct = clamp((pow / 200) * 100, 0, 100);
      $powFill.style.width = `${powPct}%`;
      $powText.textContent = nfmt(pow);

      const heat = clamp(p2.heat || 0, 0, TUNE.heatMax);
      $heatFill.style.width = `${(heat / TUNE.heatMax) * 100}%`;
      $heatText.textContent = `${Math.floor(heat)}%`;

      $signal.textContent = nfmt(p2.signal || 0);
      $sps.textContent = (p2.signalPerSecond || 0).toFixed(2);
      $pps.textContent = (p2.powerPerSecond || 0).toFixed(2);

      const hr = heatRate(p2);
      const ventC = ventCost(p2);
      const ventA = ventAmount(p2);

      const locked = p2.isOverheated || (p2._overheatUntil || 0) > Date.now();
      btnReroute.disabled = locked;
      btnVent.disabled = locked;

      btnReroute.textContent = `Reroute: ${p2.reroute.active ? "ON" : "OFF"}`;
      $heatHint.textContent = `Heat rate: ${hr.toFixed(2)}/s`;

      const onText = p2.reroute.active
        ? `Reroute ON: x${rr.mult.toFixed(2)} SPS, -${rr.drain.toFixed(2)} power/s, +${rr.heatAdd.toFixed(2)} heat/s`
        : `Reroute OFF: safe flow.`;

      const cdLeft = Math.max(0, (p2._ventCooldownUntil || 0) - Date.now());
      const ventReady = cdLeft === 0 ? "ready" : `${Math.ceil(cdLeft / 1000)}s`;

      $hint.textContent = `${onText} • Vent: -${Math.floor(ventA)} heat for ${nfmt(ventC)} power (${ventReady})`;

      $comms.textContent = (p2.comms || []).join("\n");
      $tx.textContent = (p2.transmission || []).join("\n");

      renderShop();

      if (p2.isOverheated) {
        overheatBody.innerHTML = `
          <div style="opacity:0.9;">
            Heat reached <b>100%</b>. Systems locked for safety.
          </div>
          <div style="margin-top:8px; font-size:13px; opacity:0.85;">
            Vent earlier. Reroute is powerful but it bites.
          </div>
        `;
        overheatOverlay.style.display = "block";
      }
    }

    render();

    const repaint = setInterval(() => {
      render();
      const st = api.getState();
      maybeWarn(st.phases.phase2);
    }, 500);

    this._cleanup = () => clearInterval(repaint);
  },

  unmount() {
    if (this._cleanup) this._cleanup();
  },

  tick({ state, dtMs }) {
    const now = Date.now();

    // Overheat lockout timer (if any)
    if ((state._overheatUntil || 0) > now) {
      state.isOverheated = true;
    }

    if (state.isOverheated) return { state };

    // Passive gain
    state.power = (state.power || 0) + (state.powerPerSecond || 0) * (dtMs / 1000);

    // Signal gain (baseline)
    let sps = state.signalPerSecond || 0;

    // Reroute modifies output but drains power and adds heat
    const rr = rerouteParams(state);
    if (state.reroute?.active) {
      sps *= rr.mult;

      const drain = rr.drain * (dtMs / 1000);
      state.power = (state.power || 0) - drain;

      if (state.power <= 0) {
        state.power = 0;
        state.reroute.active = false;
        pushLog(state.transmission, "REROUTE//DROP  Power depleted. Auto-disengaged.");
      }

      state.heat = clamp((state.heat || 0) + rr.heatAdd * (dtMs / 1000), 0, TUNE.heatMax);
    }

    state.signal = (state.signal || 0) + sps * (dtMs / 1000);

    // Heat baseline
    const hr = heatRate(state);
    state.heat = clamp((state.heat || 0) + hr * (dtMs / 1000), 0, TUNE.heatMax);

    if (state.heat >= TUNE.heatMax) {
      state.isOverheated = true;
      state._overheatUntil = Date.now() + TUNE.overheatLockSeconds * 1000;
      state.reroute.active = false;
      pushLog(state.comms, "ENGINEERING//LOCK  Overheat. Safety lock engaged.");
    }

    return { state };
  },

  applyOfflineProgress({ state, dtMs }) {
    // Simple offline: just apply passive gains, but avoid infinite reroute abuse
    if (dtMs < 1000) return { state, summary: [] };

    const secs = dtMs / 1000;

    const beforeSig = state.signal || 0;
    const beforePow = state.power || 0;
    const beforeHeat = state.heat || 0;

    state.power = beforePow + (state.powerPerSecond || 0) * secs;

    // If reroute was ON, cap offline reroute time to 30s to prevent huge abuse on refresh
    let rerouteSecs = 0;
    if (state.reroute?.active) rerouteSecs = Math.min(30, secs);

    const rr = rerouteParams(state);
    let sigGain = (state.signalPerSecond || 0) * secs;
    let heatGain = heatRate(state) * secs;

    if (rerouteSecs > 0) {
      sigGain += (state.signalPerSecond || 0) * (rr.mult - 1) * rerouteSecs;
      heatGain += rr.heatAdd * rerouteSecs;

      const drain = rr.drain * rerouteSecs;
      state.power = Math.max(0, state.power - drain);

      if (state.power === 0) state.reroute.active = false;
    }

    state.signal = beforeSig + sigGain;
    state.heat = clamp(beforeHeat + heatGain, 0, TUNE.heatMax);

    let overheated = false;
    if (state.heat >= TUNE.heatMax) {
      state.isOverheated = true;
      state.reroute.active = false;
      overheated = true;
    }

    const summary = [
      `Offline for ${Math.floor(secs)}s`,
      `Signal +${Math.floor(sigGain)} • Power +${Math.floor(state.power - beforePow)}`,
      `Heat ${Math.floor(beforeHeat)}% → ${Math.floor(state.heat)}%`,
    ];
    if (rerouteSecs > 0) summary.push(`Reroute applied for ${Math.floor(rerouteSecs)}s (capped).`);
    if (overheated) summary.push(`OVERHEAT occurred while offline.`);

    return { state, summary };
  },
};
