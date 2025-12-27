function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export default {
  id: "phase2",

  mount(root, api) {
    const profile = api.getProfile();
    const st = api.getState();
    const unlocked = !!st?.meta?.unlockedPhases?.phase2;

    root.innerHTML = `
      <style>
        .p2-panel {
          border: 1px solid rgba(215,255,224,0.16);
          border-radius: 12px;
          background: rgba(10,14,18,0.72);
          padding: 14px;
          position: relative;
          overflow: hidden;
        }
        .p2-scan:before {
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
        .p2-btn {
          padding: 10px;
          border-radius: 10px;
          border: 1px solid rgba(215,255,224,0.18);
          background: rgba(5,7,10,0.35);
          color: inherit;
        }
        .p2-title { font-weight: 900; letter-spacing: 0.10em; font-size: 12px; opacity: 0.9; }
        .p2-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
      </style>

      <div style="max-width: 860px; margin: 0 auto; padding: 14px;">
        <div class="p2-panel p2-scan">
          <div style="display:flex; justify-content:space-between; gap:10px; align-items:center; flex-wrap:wrap;">
            <div>
              <div style="opacity:0.85; font-size:13px;">Logged in as</div>
              <div style="font-weight:900; letter-spacing:0.05em;">
                ${escapeHtml(profile?.username ?? "UNKNOWN")}
              </div>
            </div>
            <button id="back" class="p2-btn">Return to Phase 1</button>
          </div>

          <hr style="border:0; border-top:1px solid rgba(215,255,224,0.12); margin:14px 0;">

          <div class="p2-title">PHASE 2 // PLACEHOLDER</div>
          <div style="margin-top:10px; opacity:0.9;">
            You made it through Phase 1. This bay is empty for now, but it’s wired into the ship.
          </div>

          <div class="p2-panel p2-scan" style="margin-top:12px; background: rgba(5,7,10,0.35);">
            <div class="p2-title">SYSTEM READOUT</div>
            <div class="p2-mono" style="margin-top:10px; font-size:12px; white-space:pre-wrap; opacity:0.9;">
Unlocked: ${unlocked ? "YES" : "NO"} (meta.unlockedPhases.phase2)
Current phase: ${escapeHtml(st?.phase ?? "")}
Schema: ${escapeHtml(st?.meta?.schema ?? "")}

Next: Phase 2 will become its own plugin with its own UI + mechanics.
            </div>
          </div>

        </div>
      </div>
    `;

    root.querySelector("#back").onclick = async () => {
      await api.setPhase("phase1");
    };
  },

  unmount() {},
  tick({ state }) { return { state }; },
  applyOfflineProgress({ state }) { return { state, summary: [] }; },
};
