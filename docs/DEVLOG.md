# Sygn1L2 Dev Log

## 2025-12-28 (Sydney) – Phase 1 panels, logs, and pressure
**Goal**
- Make Phase 1 feel like a ship console: panels, scanlines, scope toys.
- Add a pressure mechanic (Corruption) so Phase 1 has a win/lose loop.
- Keep everything phase-local (plugin owns gameplay + styling).

**Changes**
- Phase 1 UI rebuilt into a panel layout: header, stats, scope+osc, upgrade shop, comms/transmission.
- Added Corruption pressure (0..100) that grows over time (and slightly with progression).
- Added Purge action (spend Signal to reduce corruption) + new upgrades (Noise Canceller, Purge Manifold).
- Added defeat overlay when Corruption hits 100%.
- Added lightweight logs: comms warnings at 25/50/75% corruption, transmissions on upgrades/purge.

**Files touched**
- src/plugins/phase1/plugin.js
- src/core/state.js
- src/core/pluginLoader.js

**How to test**
1. Load Phase 1, confirm Signal ticks up.
2. Watch Corruption rise. Use Purge to reduce it.
3. Buy Noise Canceller to slow Corruption.
4. Let Corruption reach 100% to confirm defeat overlay + restart works.
5. Refresh after 10–30 seconds: offline report shows signal/corruption change.

**Notes**
- Admin functions intentionally not included (deferred).
- BUILD stamp in pluginLoader can be bumped if mobile caching shows old UI.


## 2025-12-28 (Sydney) – Mobile double-tap zoom suppression
**Goal**
- Prevent iOS Safari double-tap zoom so rapid button tapping doesn't zoom the page.

**Changes**
- Updated viewport meta to disable user scaling.
- Added touch-action: manipulation for html/body and interactive elements.
- Added touchend/gesturestart handlers to suppress double-tap and pinch zoom.

**Files touched**
- index.html

**How to test**
1. Open game on iPhone Safari.
2. Rapidly tap Ping/Purge/Buy buttons.
3. Page should not zoom in/out on double taps.


## 2025-12-28 (Sydney) – Phase 1 telemetry + tuning block
**Goal**
- Make Phase 1 balancing fast and repeatable without guesswork.
- Keep all tunable numbers in one phase-local tuning object.

**Changes**
- Added `TUNE` object in Phase 1 for win condition, corruption, ping noise, and purge values.
- Added a dev-only Telemetry panel (toggle) showing live: corruption rate, ETA to failure, win checks/hold timer, purge stats.

**Files touched**
- src/plugins/phase1/plugin.js
- src/core/pluginLoader.js
- docs/DEVLOG.md

**How to test**
1. Log in as PrymalChaos.
2. Enter Phase 1, open DEV panel, tap “Telemetry (dev)”.
3. Confirm telemetry updates while playing (signal/sps/corruption/rate/ETAs).
4. Buy Noise Canceller and confirm corruption rate decreases.


## 2025-12-28 (Sydney) – Telemetry panel population fix
**Fix**
- Phase 1 telemetry panel now renders live metrics instead of staying blank.

**Files touched**
- src/plugins/phase1/plugin.js
- src/core/pluginLoader.js


## 2025-12-28 (Sydney) – Phase 1 milestones + message beats
**Goal**
- Add pacing: milestone-triggered comms/transmission beats that fire once and persist across saves.

**Changes**
- Phase 1: Added milestone system using phase-local flags + stats:
  - Signal milestones: 250 / 1k / 5k / win threshold.
  - First upgrade purchased.
  - First purge executed.
  - Stabilisation window open (win eligible).
- Milestones write short Alien-style log beats to COMMS/TRANSMISSION and persist.
- Telemetry shows fired milestone keys.

**Files touched**
- src/plugins/phase1/plugin.js
- src/core/state.js
- src/core/pluginLoader.js

**How to test**
1. Start Phase 1 and reach 250/1,000/5,000 signal and watch logs.
2. Buy first upgrade: one-time transmission beat fires.
3. Use Purge once: one-time comms beat fires.
4. Meet win eligibility: stabilisation window beat fires.
5. Refresh or log in from another browser: milestones do not repeat.


## 2025-12-28 (Sydney) – Phase 2 Engineering prototype (Power + Heat + Reroute)
**Goal**
- Turn Phase 2 from a placeholder into a distinct, modular gameplay loop.
- Add a new resource (Power) and a new pressure mechanic (Heat) with risk/reward decisions.

**Changes**
- Implemented Phase 2 plugin with:
  - Power generation (PPS), Heat pressure (0–100), and Reroute toggle.
  - Reroute boosts SPS but drains power and adds heat. Auto-disengages when power hits 0.
  - Vent action to spend Power to reduce Heat (with cooldown).
  - Overheat lockout overlay with cooldown.
  - Upgrade shop: Aux Generator, Thermal Insulation, Reroute Dampers, Pressure Vents.
  - Comms/Transmission logs + dev tools.
- Updated Phase 2 default state (schema bumped to 5).
- Bumped plugin loader BUILD for cache busting.

**Files touched**
- src/plugins/phase2/plugin.js
- src/core/state.js
- src/core/pluginLoader.js

**How to test**
1. Win Phase 1 and continue to Phase 2 (or use dev tools if available).
2. Watch Power tick up; use Reroute to boost Signal, observe Power drain + Heat rise.
3. Use Vent to reduce Heat; confirm cooldown.
4. Let Heat reach 100% to trigger Overheat lockout overlay.


## 2025-12-28 (Sydney) – Phase 1 scopes (CRT waveform + circle oscilloscope)
**Goal**
- Replace text scopes with animated CRT-style displays:
  - Scope bar as a sine-wave based flow display (with noise from corruption and ping “kicks”).
  - Oscilloscope as a Lissajous figure that tightens into a perfect circle at 100% synchronicity.

**Design**
- Scope amplitude scales with SPS and corruption (instability).
- Oscilloscope synchronicity is based on progress toward the Phase 1 signal win threshold (12,000); at 100% the figure becomes a perfect circle (90° phase offset).

**Files touched**
- src/plugins/phase1/plugin.js
- src/core/pluginLoader.js (BUILD bump)

**How to test**
1. Load Phase 1 (?v=scopes1).
2. Watch scope waveform respond to SPS changes and corruption.
3. Observe oscilloscope tighten as Signal approaches 12,000.


## 2025-12-28 (Sydney) – Phase 1 scopes hotfix (prevent null scope crash)
**Fix**
- The old text-based scope renderer still ran after switching to canvas, and crashed because #scope/#osc no longer exist.
- Guarded the legacy scope text update so Phase 1 render loop and tick never halt.

**Files touched**
- src/plugins/phase1/plugin.js
- src/core/pluginLoader.js (BUILD bump)


## 2025-12-28 (Sydney) – Phase 1 scopes fix (iOS canvas sizing)
**Fix**
- Scopes could render blank because canvas sizing relied on getBoundingClientRect() returning 0 during initial iOS layout.
- Updated sizing to fall back to offsetWidth/offsetHeight and setTransform(dpr,…) correctly.
- Added dev-only scope debug labels showing canvas dimensions to confirm rendering.

**Files touched**
- src/plugins/phase1/plugin.js
- src/core/pluginLoader.js (BUILD bump)


## 2025-12-28 (Sydney) – Phase 1 skin + scopes merge fix
**Problem**
- Some scope patches overwrote the CRT skin, and iOS could still show blank scopes if canvas sizing hit 0 during first layout.

**Fix**
- Restored CRT skin classes/styles (p1-shell + p1-crt panels).
- Ensured scopes draw during render() as well as RAF (covers mobile RAF throttling).
- Added always-on canvas debug label showing scope canvas dimensions.

**Files touched**
- src/plugins/phase1/plugin.js
- src/core/pluginLoader.js


## 2025-12-28 (Sydney) – Phase 1 time trial reset + win popup loop fix
- Added Phase 1 run reset (time trial) while preserving best completion time.
- Win overlay now shows once per run (guarded by phase1.win.handled).
- Phase 2 provides a “Restart Phase 1 (Time Trial)” button.


## 2025-12-28 (Sydney) – Phase 1 crew badge popups restored
**Issue**
- Milestone badge avatar popups stopped appearing because Phase 1 plugin was overwritten by later patches, removing the popup rail + procedural badge generator.

**Fix**
- Restored procedural “crew badge” avatar popups and re-wired them to milestone log lines.
- Any log line matching `SPEAKER//POPUP ...` will force a popup.
- Milestone lines without POPUP still trigger a popup (speaker inferred from `SPEAKER//...`).

**Files touched**
- src/plugins/phase1/plugin.js
- src/core/pluginLoader.js (BUILD bump for cache-busting)
